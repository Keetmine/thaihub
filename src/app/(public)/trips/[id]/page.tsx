import AppLink from "@/components/AppLink";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import {
  dateKey,
  endOfDay,
  formatShortDate,
  formatTime,
  shortMonthName,
  shortWeekdayName,
  startOfDay,
} from "@/lib/dates";
import { getT, localeHref, type Dict, type Locale } from "@/lib/i18n";
import { flattenOccurrence } from "@/lib/eventOccurrences";
import type { TripItemVisibility } from "@/generated/prisma/client";
import { clampItemVisibility, itemVisibilityChoices } from "../itemVisibility";
import { getFavoritedEventIds, getGoingOccurrenceIds } from "@/lib/favorites";
import { getFriendIds, getFriendsGoingByOccurrence } from "@/lib/friends";
import { deleteTrip } from "../actions";
import EmptyState from "@/components/EmptyState";
import EventCard from "@/components/EventCard";
import ConfirmForm from "@/components/ConfirmForm";
import AddPersonalEventButton from "../AddPersonalEventButton";
import PersonalEventCard, { type PersonalEventData } from "../PersonalEventCard";
import TripTodos, { TodoRow } from "../TripTodos";
import TripMembersButton, { TripInviteActions } from "../TripMembersControls";
import { VisibilitySelect } from "../TripVisibilityControls";
import EditTripButton from "../EditTripButton";
import LocationMapLoader from "@/components/LocationMapLoader";
import {
  AttachListSelect,
  DetachListButton,
  RemoveTripPlaceButton,
} from "../TripPlacesControls";
import { isPremiumActive } from "@/lib/premium";
import { listHref, locationHref, slugOrIdWhere, tripHref } from "@/lib/slugHelpers";
import { userDisplayName } from "@/lib/userProfile";
import TripBookings from "./TripBookings";
import AddBookingButton from "./AddBookingButton";
import AddTripPlaceButton from "../AddTripPlaceButton";
import TripBookingLeg, { type BookingLegData } from "./TripBookingLeg";
import type { TripBookingRow } from "./BookingForm";

export const dynamic = "force-dynamic";

/** Время у брони указывать необязательно, и «без времени» в базе — это
 *  ровно полночь (та же договорённость, что у личных событий). */
function hasTime(d: Date): boolean {
  return formatTime(d) !== "00:00";
}

/** Даты проекта «настенные» и считаются в UTC (см. lib/dates.ts), а
 *  shortMonthName/shortWeekdayName читают локальные компоненты даты: у
 *  заселения в 22:30 они называли уже следующий день. Берём полдень тех
 *  же суток по UTC — в любой зоне это остаётся тем же днём. */
function labelDate(d: Date): Date {
  return new Date(startOfDay(d).getTime() + 12 * 3600_000);
}

/** Ночей между заездом и выездом — по календарным дням: выезд в 12:00
 *  не должен превращать три ночи в две с половиной. */
function nightsBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
}

/** Куда встаёт в дне запись без времени. День должен читаться
 *  правдоподобно и тогда, когда часа никто не знает: выселение и прилёт
 *  — это начало дня (номер освобождают утром, а после прилёта день
 *  только начинается), заселение и вылет — его конец (заезд обычно
 *  после обеда, а после вылета в этом дне уже ничего не запланируешь). */
function legSortAt(at: Date, side: "start" | "end"): Date {
  if (hasTime(at)) return at;
  return side === "end" ? startOfDay(at) : endOfDay(at);
}

/** Бронь в ленте плана — это две записи, а не одна строка сбоку:
 *  заселение в день заезда и выселение в день выезда (у перелёта — вылет
 *  и прилёт). Промежуточные дни ничем не помечаем: то, что человек живёт
 *  в отеле, и так понятно, а связь между заездом и выездом показывает
 *  линия, проходящая под карточками этих дней. */
function bookingLegs(
  b: {
    id: string;
    kind: "HOTEL" | "FLIGHT";
    name: string;
    address: string | null;
    fromPlace: string | null;
    toPlace: string | null;
    url: string | null;
    fileUrl: string | null;
    note: string | null;
    startAt: Date | null;
    endAt: Date | null;
    visibility: TripItemVisibility;
  },
  locale: Locale,
  t: Dict,
  canEdit: boolean,
): { leg: BookingLegData; sortAt: Date; isStay: boolean }[] {
  const isFlight = b.kind === "FLIGHT";
  const row: TripBookingRow = {
    id: b.id,
    kind: b.kind,
    name: b.name,
    address: b.address,
    fromPlace: b.fromPlace,
    toPlace: b.toPlace,
    url: b.url,
    fileUrl: b.fileUrl,
    note: b.note,
    startDate: b.startAt ? dateKey(b.startAt) : null,
    endDate: b.endAt ? dateKey(b.endAt) : null,
    startTime: b.startAt && hasTime(b.startAt) ? formatTime(b.startAt) : null,
    endTime: b.endAt && hasTime(b.endAt) ? formatTime(b.endAt) : null,
    visibility: b.visibility,
  };
  const place = isFlight
    ? [b.fromPlace, b.toPlace].filter(Boolean).join(" → ") || null
    : b.address;
  // Жильё с обеими датами — это «стоянка»: её концы соединяет линия.
  // Бронь с одной датой остаётся одиночной записью.
  const isStay = b.kind === "HOTEL" && !!b.startAt && !!b.endAt;

  const make = (at: Date, side: "start" | "end"): { leg: BookingLegData; sortAt: Date; isStay: boolean } => {
    // Подпись «до 5 сен · 6 ночей» / «с 29 авг» — вторая половина
    // брони словами: на экране она может оказаться далеко.
    let spanLabel: string | null = null;
    if (b.kind === "HOTEL" && side === "start" && b.endAt) {
      const nights = nightsBetween(at, b.endAt);
      spanLabel = [
        t.trips.bookings.stayUntil(formatShortDate(b.endAt, locale)),
        nights > 0 ? t.trips.bookings.nights(nights) : null,
      ]
        .filter(Boolean)
        .join(" · ");
    } else if (b.kind === "HOTEL" && side === "end" && b.startAt) {
      spanLabel = t.trips.bookings.stayFrom(formatShortDate(b.startAt, locale));
    }
    return {
      sortAt: legSortAt(at, side),
      isStay,
      leg: {
        key: `booking-${b.id}-${side}`,
        bookingId: b.id,
        kind: b.kind,
        side,
        // Подписи даты считаем здесь: даты проекта живут в UTC, а
        // локальные геттеры в браузере зрителя дали бы другой день.
        dayLabel: String(at.getUTCDate()),
        monthLabel: shortMonthName(labelDate(at), locale),
        weekdayLabel: shortWeekdayName(labelDate(at), locale),
        timeLabel: hasTime(at) ? formatTime(at) : null,
        name: b.name,
        place,
        spanLabel,
        // Заметка у брони одна на обе стороны, поэтому показываем её
        // только на первой записи — иначе «код брони 4412» повторялся бы
        // и на заселении, и на выселении.
        note: side === "start" || !b.startAt ? b.note : null,
        url: b.url,
        fileUrl: b.fileUrl,
        canEdit,
        booking: row,
      },
    };
  };

  return [
    ...(b.startAt ? [make(b.startAt, "start")] : []),
    ...(b.endAt ? [make(b.endAt, "end")] : []),
  ];
}

export default async function TripPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string; mine?: string }>;
}) {
  const { locale, t } = await getT();
  const user = await getCurrentUser();
  if (!user) redirect(localeHref("/login", locale));

  const { id: rawParam } = await params;
  const { view, mine } = await searchParams;
  // «Мой план» (по умолчанию) — только события, куда идёт владелец
  // поездки; ?view=all — вкладка «Афиша», все события этих дат из
  // афиши (без личных записей и дел); ?view=places — «что
  // посетить»: локации съёмок сериалов владельца. Для гостей план
  // владельца — и есть смысл расшаренной поездки.
  const showAll = view === "all";
  const showPlaces = view === "places";
  const showTodos = view === "todos";
  const trip = await prisma.trip.findFirst({
    where: slugOrIdWhere(rawParam),
    include: {
      personalEvents: {
        orderBy: { startsAt: "asc" },
        include: { location: { select: { id: true, name: true } } },
      },
      user: { select: { id: true, name: true, deletedAt: true } },
      // Брони жилья: показываются на вкладке плана рядом с событиями —
      // в день заселения не приходится искать письмо в почте.
      bookings: { orderBy: [{ startAt: "asc" }, { createdAt: "asc" }] },
      members: {
        include: { user: { select: { id: true, name: true, deletedAt: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!trip) notFound();

  // Доступ по видимости: PRIVATE — только владелец, FRIENDS — владелец и
  // его принятые друзья, PUBLIC — любой залогиненный. Чужому 404, а не
  // 403 — не подтверждаем само существование поездки.
  const isOwner = trip.userId === user.id;
  // Совместная поездка: принявшие инвайт участники (ACCEPTED) видят её
  // независимо от видимости и наравне с владельцем вносят события/дела.
  // PENDING — приглашение: видит страницу с баннером «принять/отклонить»,
  // но не личное/дела.
  const myMembership = trip.members.find((m) => m.userId === user.id);
  const isMember = myMembership?.status === "ACCEPTED";
  const isInvited = myMembership?.status === "PENDING";
  const acceptedMembers = trip.members.filter((m) => m.status === "ACCEPTED");
  const isParticipant = isOwner || isMember;
  const isShared = acceptedMembers.length > 0;
  // Управление поездкой (видимость, личные события) — часть платного
  // функционала; владелец без подписки видит свою поездку read-only.
  const canManage = isOwner && isPremiumActive(user);
  // Вносить события/дела могут все участники с подпиской.
  const canContribute = isParticipant && isPremiumActive(user);
  if (!isParticipant && !isInvited) {
    if (trip.visibility === "PRIVATE") notFound();
    if (trip.visibility === "FRIENDS") {
      const ownerFriendIds = await getFriendIds(trip.userId);
      if (!ownerFriendIds.includes(user.id)) notFound();
    }
  }

  const participantIds = [trip.userId, ...acceptedMembers.map((m) => m.userId)];
  const nameById = new Map<string, string>([
    [trip.userId, userDisplayName(trip.user, locale)],
    ...acceptedMembers.map((m) => [m.userId, userDisplayName(m.user, locale)] as [string, string]),
  ]);
  // Фильтр «Только моё» (совместные поездки): в плане остаются лишь мои
  // отметки «иду», мои личные события и мои дела.
  const onlyMine = isShared && isParticipant && mine === "1";
  // Автор записи для подписи в карточке (легаси-записи без createdById —
  // владельца); подписываем только в совместных поездках.
  const authorLabel = (createdById: string | null): string | null =>
    isShared ? (nameById.get(createdById ?? trip.userId) ?? null) : null;

  const rangeWhere = { startsAt: { gte: trip.startDate, lte: endOfDay(trip.endDate) } };
  const [occurrences, planCount, totalCount] = await Promise.all([
    prisma.eventOccurrence.findMany({
      where: {
        ...rangeWhere,
        // План совместной поездки — отметки «иду» всех участников;
        // «Только моё» сужает до текущего юзера.
        ...(showAll
          ? {}
          : {
              attendances: {
                some: { userId: onlyMine ? user.id : { in: participantIds } },
              },
            }),
      },
      include: { event: { include: { performers: { include: { performer: { select: { id: true, name: true, slug: true } } } } } } },
      orderBy: { startsAt: "asc" },
    }),
    prisma.eventOccurrence.count({
      where: { ...rangeWhere, attendances: { some: { userId: { in: participantIds } } } },
    }),
    prisma.eventOccurrence.count({ where: rangeWhere }),
  ]);
  const events = occurrences.map(flattenOccurrence);

  const eventIds = events.map((ev) => ev.id);
  const occIds = events.map((ev) => ev.occurrenceId);
  const [favoritedIds, goingIds, friendIds] = await Promise.all([
    getFavoritedEventIds(eventIds, user.id),
    getGoingOccurrenceIds(occIds, user.id),
    getFriendIds(user.id),
  ]);
  const friendsGoingByEvent = await getFriendsGoingByOccurrence(occIds, friendIds);

  // Билеты юзера к датам плана — 🎫 прямо в карточке события.
  const myTickets = await prisma.eventAttendance.findMany({
    where: { userId: user.id, occurrenceId: { in: occIds }, ticketUrl: { not: null } },
    select: { occurrenceId: true, ticketUrl: true },
  });
  const ticketByOccurrence = new Map(myTickets.map((t) => [t.occurrenceId, t.ticketUrl]));

  // Право менять конкретную запись: автор, владелец поездки или другой
  // участник, если автор разрешил галочкой (editableByOthers).
  const canTouch = (item: { createdById: string | null; editableByOthers: boolean }): boolean => {
    if (!canContribute) return false;
    const authorId = item.createdById ?? trip.userId;
    return authorId === user.id || isOwner || item.editableByOthers;
  };
  const isMine = (createdById: string | null): boolean =>
    (createdById ?? trip.userId) === user.id;

  // Кто видит конкретную запись поездки — дело, личное событие, бронь.
  // Решает поле `visibility` самой записи (у записей до этого поля —
  // PARTICIPANTS): PRIVATE — только автор, PARTICIPANTS — те, кто едет,
  // FRIENDS — плюс друзья автора, PUBLIC — все, кто вообще дошёл до
  // страницы (доступ к самой поездке проверен выше). Дружба
  // симметрична, поэтому «друг автора» — это автор в списке друзей
  // зрителя, второго запроса не нужно.
  //
  // Запись при этом не может быть виднее самой поездки: у поездки
  // FRIENDS публичная бронь видна друзьям, а не всем. Зажим стоит на
  // ЧТЕНИИ (`clampItemVisibility`), а не переписывает записи при смене
  // видимости поездки: выбор человека сохраняется, и стоит вернуть
  // поездке прежнюю видимость — записи снова открываются.
  const effectiveVisibility = (visibility: TripItemVisibility): TripItemVisibility =>
    clampItemVisibility(visibility, trip.visibility);
  const canSeeItem = (
    visibility: TripItemVisibility,
    createdById: string | null,
  ): boolean => {
    const authorId = createdById ?? trip.userId;
    if (authorId === user.id) return true;
    const effective = effectiveVisibility(visibility);
    if (effective === "PRIVATE") return false;
    if (effective === "PUBLIC") return true;
    if (isParticipant) return true;
    return effective === "FRIENDS" && friendIds.includes(authorId);
  };
  // Варианты для радио-группы в формах записи — тем же правилом. Пусто
  // в приватной соло-поездке: выбирать не из чего, поля в форме нет.
  const visibilityOptions = itemVisibilityChoices(trip.visibility, isShared);

  // Публичные и личные события — одна хронологическая лента. Кого
  // пускать к личной записи, решает её собственная видимость.
  const personal: PersonalEventData[] = trip.personalEvents
    .filter((p) => canSeeItem(p.visibility, p.createdById))
    .filter((p) => !onlyMine || isMine(p.createdById))
    .map((p) => ({
      id: p.id,
      title: p.title,
      note: p.note,
      location: p.location,
      startsAt: p.startsAt,
      dateKey: dateKey(p.startsAt),
      timeValue: formatTime(p.startsAt),
      author: authorLabel(p.createdById),
      editableByOthers: p.editableByOthers,
      // Бейдж и форма правки показывают зажатое значение: обещать
      // «всем» в поездке для друзей было бы неправдой.
      visibility: effectiveVisibility(p.visibility),
      showOnHome: p.showOnHome,
      imageUrl: p.imageUrl,
      canEdit: canTouch(p),
    }));
  // Дела поездки: кого пускать к каждому, решает его видимость.
  const todos = await prisma.tripTodo.findMany({
    where: { tripId: trip.id },
    orderBy: [{ done: "asc" }, { date: "asc" }],
  });
  const todoData = todos
    .filter((t) => canSeeItem(t.visibility, t.createdById))
    .filter((t) => !onlyMine || isMine(t.createdById))
    .map((t) => ({
      id: t.id,
      text: t.text,
      done: t.done,
      date: t.date ? t.date.toISOString() : null,
      hasTime: t.hasTime,
      author: authorLabel(t.createdById),
      canEdit: canTouch(t),
      editableByOthers: t.editableByOthers,
      visibility: effectiveVisibility(t.visibility),
    }));

  // ЕДИНСТВЕННАЯ точка, где брони попадают в разметку. Жильё и перелёты
  // — закрытая информация: по умолчанию (PARTICIPANTS) их видят только
  // владелец и принятые участники, и автор должен отдельно выбрать
  // FRIENDS/PUBLIC, чтобы бронь увидел кто-то ещё. Гейт стоит на
  // данных, а не на стилях: невидимая бронь не даёт ни строк ленты, ни
  // линии жилья, и в HTML не уходит ничего.
  // Датированные брони идут в ленту, брони без дат — в блок над ней
  // (в ленте им негде встать).
  // Открытая бронь показывает только суть: вид, название, даты и
  // маршрут. Адрес, заметка (там номер брони и код от двери), ссылка и
  // файл подтверждения остаются участникам — «видно всем» про то, где и
  // когда человек будет, а не про то, как попасть в его номер.
  const bookingForViewer = <T extends { address: string | null; note: string | null; url: string | null; fileUrl: string | null }>(
    b: T,
  ): T => (isParticipant ? b : { ...b, address: null, note: null, url: null, fileUrl: null });
  const visibleBookings = trip.bookings
    .map((b) => ({ ...b, visibility: effectiveVisibility(b.visibility) }))
    .filter((b) => canSeeItem(b.visibility, null))
    .map(bookingForViewer);
  const legs = showAll
    ? []
    : visibleBookings.flatMap((b) => bookingLegs(b, locale, t, canContribute));
  const undatedBookings: TripBookingRow[] = visibleBookings
    .filter((b) => !b.startAt && !b.endAt)
    .map((b) => ({
      id: b.id,
      kind: b.kind,
      name: b.name,
      address: b.address,
      fromPlace: b.fromPlace,
      toPlace: b.toPlace,
      url: b.url,
      fileUrl: b.fileUrl,
      note: b.note,
      startDate: null,
      endDate: null,
      startTime: null,
      endTime: null,
      visibility: b.visibility,
    }));

  const timeline: (
    | { kind: "public"; startsAt: Date; key: string; event: (typeof events)[number] }
    | { kind: "personal"; startsAt: Date; key: string; personalEvent: PersonalEventData }
    | { kind: "todo"; startsAt: Date; key: string; todo: (typeof todoData)[number] }
    | { kind: "booking"; startsAt: Date; key: string; leg: BookingLegData; isStay: boolean }
  )[] = [
    ...events.map((ev) => ({ kind: "public" as const, startsAt: ev.startsAt, key: `pub-${ev.occurrenceId}`, event: ev })),
    // Вкладка «Афиша» — только события афиши: личные записи и дела там
    // мешали (просьба владельца). Они живут в «Плане».
    ...(showAll
      ? []
      : personal.map((p) => ({ kind: "personal" as const, startsAt: p.startsAt, key: `own-${p.id}`, personalEvent: p }))),
    // Датированные дела попадают в хронологию плана.
    ...(showAll
      ? []
      : todoData
          .filter((t) => t.date)
          .map((t) => ({ kind: "todo" as const, startsAt: new Date(t.date!), key: `todo-${t.id}`, todo: t }))),
    ...legs.map(({ leg, sortAt, isStay }) => ({
      kind: "booking" as const,
      startsAt: sortAt,
      key: leg.key,
      leg,
      isStay,
    })),
  ].sort(
    (a, b) =>
      a.startsAt.getTime() - b.startsAt.getTime() ||
      // Ровно в одну минуту с событием бронь идёт первой: сначала
      // заселяешься (или сдаёшь номер), потом идёшь на событие.
      (a.kind === "booking" ? 0 : 1) - (b.kind === "booking" ? 0 : 1),
  );

  // Полоса жилья: дни между заездом и выездом лежат на общей тёплой
  // подложке ПОД карточками — вместо строки «проживание в отеле» на
  // каждый день. Считаем по уже отсортированной ленте: заселение
  // открывает полосу, выселение закрывает. Счётчик, а не флаг, — иначе
  // пересекающиеся брони (переезд в тот же день) рвали бы полосу.
  const rows: { item: (typeof timeline)[number]; stay: "open" | "inside" | "close" | null }[] = [];
  let openStays = 0;
  for (const item of timeline) {
    let stay: "open" | "inside" | "close" | null = openStays > 0 ? "inside" : null;
    if (item.kind === "booking" && item.isStay) {
      if (item.leg.side === "start") {
        stay = openStays > 0 ? "inside" : "open";
        openStays += 1;
      } else {
        openStays = Math.max(0, openStays - 1);
        stay = openStays > 0 ? "inside" : "close";
      }
    }
    rows.push({ item, stay });
  }

  // «Что посетить» (Г4): локации съёмок сериалов владельца + прикреплённые
  // списки мест + отдельные добавленные места.
  const [tripLists, tripPlaces, myLists] = showPlaces
    ? await Promise.all([
        prisma.tripPlaceList.findMany({
          where: { tripId: trip.id },
          include: { list: { include: { items: { include: { location: true } } } } },
        }),
        prisma.tripPlace.findMany({
          where: { tripId: trip.id },
          include: { location: true },
        }),
        isParticipant
          ? prisma.placeList.findMany({
              where: { userId: user.id },
              select: { id: true, title: true },
              orderBy: { createdAt: "desc" },
            })
          : Promise.resolve([]),
      ])
    : [[], [], []];
  const attachedListIds = new Set(tripLists.map((t) => t.listId));
  const availableLists = myLists.filter((l) => !attachedListIds.has(l.id));

  // Кандидаты в участники — друзья владельца, которых ещё нет в поездке
  // (friendIds для владельца — его же друзья).
  const memberIdSet = new Set(trip.members.map((m) => m.userId));
  const availableFriends = isOwner
    ? await prisma.user.findMany({
        where: { id: { in: friendIds.filter((id) => !memberIdSet.has(id)) } },
        select: { id: true, name: true, deletedAt: true },
        orderBy: { name: "asc" },
      })
    : [];

  const boundDelete = deleteTrip.bind(null, trip.id);

  return (
    <div>
      <AppLink href="/trips" className="eyebrow text-decoration-none">
        {t.trips.detail.back}
      </AppLink>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mt-3 mb-5">
        <div>
          <h1 className="display-1-tight mb-1 d-flex align-items-center gap-2" style={{ fontSize: "2.5rem" }}>
            {trip.title}
            {canManage && (
              <EditTripButton
                trip={{
                  id: trip.id,
                  title: trip.title,
                  startKey: dateKey(trip.startDate),
                  endKey: dateKey(trip.endDate),
                }}
              />
            )}
          </h1>
          <p className="text-secondary mb-0">
            {formatShortDate(trip.startDate, locale)} – {formatShortDate(trip.endDate, locale)}{" "}
            {trip.endDate.getFullYear()}
          </p>
        </div>
        {isParticipant ? (
          <div className="d-flex align-items-center gap-2 flex-wrap">
            {canManage && (
              <VisibilitySelect tripId={trip.id} visibility={trip.visibility} />
            )}
            <TripMembersButton
              tripId={trip.id}
              isOwner={isOwner}
              owner={{ id: trip.userId, name: trip.user.name, deletedAt: trip.user.deletedAt }}
              members={trip.members.map((m) => ({
                id: m.userId,
                name: m.user.name,
                deletedAt: m.user.deletedAt,
                pending: m.status === "PENDING",
              }))}
              availableFriends={availableFriends}
            />
          </div>
        ) : (
          <AppLink
            href={`/users/${trip.user.id}`}
            className="small text-secondary text-decoration-none"
          >
            {trip.user.name
              ? t.trips.detail.ofUser(userDisplayName(trip.user, locale))
              : t.trips.detail.ofFriend}
          </AppLink>
        )}
      </div>

      {isInvited && (
        <div className="surface d-flex flex-wrap align-items-center justify-content-between gap-3 p-3 mb-4">
          <span>
            {t.trips.detail.inviteBanner(
              trip.user.name
                ? userDisplayName(trip.user, locale)
                : t.trips.detail.someone,
            )}
          </span>
          <TripInviteActions tripId={trip.id} />
        </div>
      )}

      {/* Ряд добавления стоит НАД вкладками и виден на любой из них
          (просьба владельца): раньше он жил внутри плана, и с «Дел» или
          «Что посетить» добавить событие было нельзя, не вернувшись
          назад. Кнопок нет вовсе у тех, кому нечего вносить, — у гостя
          и у участника без подписки. «+ Событие» акцентная: её жмут
          чаще всего. */}
      {canContribute && (
        <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
          <AddPersonalEventButton
            tripId={trip.id}
            showShareToggle={isShared}
            visibilityOptions={visibilityOptions}
            label={t.trips.personal.addShort}
            accent
          />
          <AddBookingButton tripId={trip.id} kind="HOTEL" visibilityOptions={visibilityOptions} />
          <AddBookingButton tripId={trip.id} kind="FLIGHT" visibilityOptions={visibilityOptions} />
          <AddTripPlaceButton tripId={trip.id} />
        </div>
      )}

      <div className="tab-bar-row">
        <div className="tab-bar">
          <AppLink
            href={tripHref(trip)}
            prefetch={false}
            className={`tab-bar-item ${!showAll && !showPlaces && !showTodos ? "active" : ""}`}
          >
            {!isShared && isOwner
              ? t.trips.detail.tabMyPlan(planCount)
              : t.trips.detail.tabPlan(planCount)}
          </AppLink>
          <AppLink
            href={`${tripHref(trip)}?view=all`}
            prefetch={false}
            className={`tab-bar-item ${showAll ? "active" : ""}`}
          >
            {t.trips.detail.tabEvents(totalCount)}
          </AppLink>
          {/* Вкладка дел есть у тех, кто вносит, и у того, кому хоть одно
              дело видно: с появлением видимости у записи дело может быть
              открыто друзьям или всем. */}
          {(isParticipant || todoData.length > 0) && (
            <AppLink
              href={`${tripHref(trip)}?view=todos`}
              prefetch={false}
              className={`tab-bar-item ${showTodos ? "active" : ""}`}
            >
              {t.trips.detail.tabTodos(todoData.length)}
            </AppLink>
          )}
          <AppLink
            href={`${tripHref(trip)}?view=places`}
            prefetch={false}
            className={`tab-bar-item ${showPlaces ? "active" : ""}`}
          >
            {t.trips.detail.tabPlaces}
          </AppLink>
        </div>
        {isShared && isParticipant && !showAll && !showPlaces && (
          <AppLink
            href={`${tripHref(trip)}${showTodos ? "?view=todos" : ""}${onlyMine ? "" : showTodos ? "&mine=1" : "?mine=1"}`}
            prefetch={false}
            className={`btn btn-sm ${onlyMine ? "btn-primary" : "btn-ghost"}`}
          >
            {t.trips.detail.onlyMine}
          </AppLink>
        )}
      </div>

      {/* Брони без дат: в ленте им негде встать, а видеть и дозаполнять
          их надо. Датированные стоят ниже, в ленте плана, в свои дни. */}
      {!showTodos && !showPlaces && (
        <TripBookings
          tripId={trip.id}
          canEdit={canContribute}
          bookings={undatedBookings}
          visibilityOptions={visibilityOptions}
        />
      )}

      {showTodos ? (
        <TripTodos
          tripId={trip.id}
          todos={todoData}
          canAdd={canContribute}
          showShareToggle={isShared}
          visibilityOptions={visibilityOptions}
        />
      ) : showPlaces ? (
        (() => {
          const pinMap = new Map<string, { id: string; name: string; latitude: number; longitude: number }>();
          const addPin = (l: { id: string; name: string; latitude: number | null; longitude: number | null }) => {
            if (l.latitude != null && l.longitude != null && !pinMap.has(l.id)) {
              pinMap.set(l.id, { id: l.id, name: l.name, latitude: l.latitude, longitude: l.longitude });
            }
          };
          tripLists.forEach((tl) => tl.list.items.forEach((i) => addPin(i.location)));
          tripPlaces.forEach((tp) => addPin(tp.location));
          const pins = Array.from(pinMap.values());
          const isEmpty =
            tripLists.length === 0 && tripPlaces.length === 0;
          return isEmpty && !isParticipant ? (
          <EmptyState
            emoji="📍"
            title={t.trips.places.emptyGuestTitle}
            hint={t.trips.places.emptyGuestHint}
            compact
          />
        ) : (
          <>
            {/* Поиск места и «своё место» переехали в кнопку «+ Место»
                над вкладками — здесь остался только тот способ, которого
                там нет: прикрепить готовый список. */}
            {canContribute && (
              <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                <AttachListSelect tripId={trip.id} availableLists={availableLists} />
              </div>
            )}
            {pins.length > 0 && (
              <div className="mb-4">
                <LocationMapLoader locations={pins} height="22rem" />
              </div>
            )}

            {tripLists.map((tl) => (
              <div key={tl.listId} className="mb-4">
                <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                  <AppLink
                    href={listHref(tl.list)}
                    className="section-heading text-decoration-none"
                  >
                    📋 {tl.list.title} ({tl.list.items.length})
                  </AppLink>
                  {canContribute && <DetachListButton tripId={trip.id} listId={tl.listId} />}
                </div>
                <div className="d-flex flex-column gap-2">
                  {tl.list.items.map((i) => (
                    <AppLink
                      key={i.locationId}
                      href={locationHref(i.location)}
                      className="surface surface-hover text-decoration-none d-flex align-items-center gap-3 p-2 px-3"
                    >
                      <span className="text-white">{i.location.name}</span>
                      {i.note && <span className="small text-secondary text-truncate">— {i.note}</span>}
                    </AppLink>
                  ))}
                </div>
              </div>
            ))}

            {tripPlaces.length > 0 && (
              <div className="mb-4">
                <h2 className="section-heading mb-2">{t.trips.places.standalone}</h2>
                <div className="d-flex flex-column gap-2">
                  {tripPlaces.map((tp) => (
                    <div
                      key={tp.locationId}
                      className="surface d-flex align-items-center justify-content-between gap-3 p-2 px-3"
                    >
                      <AppLink
                        href={locationHref(tp.location)}
                        className="text-decoration-none text-white"
                      >
                        {tp.location.name}
                      </AppLink>
                      {canContribute && <RemoveTripPlaceButton tripId={trip.id} locationId={tp.locationId} />}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isEmpty && isParticipant && (
              <EmptyState
                emoji="📍"
                title={t.trips.places.emptyTitle}
                hint={t.trips.places.emptyHint}
                compact
              />
            )}
          </>
        );
        })()
      ) : timeline.length === 0 ? (
        <EmptyState
          emoji="✈️"
          title={showAll ? t.trips.detail.emptyEventsTitle : t.trips.detail.emptyPlanTitle}
          hint={
            showAll
              ? t.trips.detail.emptyEventsHint
              : isParticipant
                ? t.trips.detail.emptyPlanHintOwn
                : t.trips.detail.emptyPlanHintGuest
          }
          compact
        />
      ) : (
        <div className="d-flex flex-column gap-3 trip-timeline">
          {rows.map(({ item, stay }) => (
            <div
              key={item.key}
              className={`trip-timeline-item${stay ? ` in-stay stay-${stay}` : ""}`}
            >
              {item.kind === "public" ? (
                <EventCard
                  event={item.event}
                  isFavorited={favoritedIds.has(item.event.id)}
                  isGoing={goingIds.has(item.event.occurrenceId)}
                  friendsGoing={friendsGoingByEvent.get(item.event.occurrenceId) ?? []}
                  ticketUrl={ticketByOccurrence.get(item.event.occurrenceId) ?? null}
                />
              ) : item.kind === "personal" ? (
                <PersonalEventCard
                  tripId={trip.id}
                  event={item.personalEvent}
                  canEdit={item.personalEvent.canEdit}
                  showShareToggle={isShared}
                  visibilityOptions={visibilityOptions}
                />
              ) : item.kind === "booking" ? (
                <TripBookingLeg
                  tripId={trip.id}
                  leg={item.leg}
                  visibilityOptions={visibilityOptions}
                />
              ) : (
                <TodoRow
                  todo={item.todo}
                  showDate
                  showShareToggle={isShared}
                  visibilityOptions={visibilityOptions}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Удаление — в самом низу страницы (просьба владельца): в шапке
          оно стояло рядом с обычными действиями и нажималось случайно,
          а операция необратимая. */}
      {isOwner && (
        <div className="mt-5 pt-4 border-top d-flex justify-content-end">
          <ConfirmForm action={boundDelete} confirmMessage={t.trips.detail.deleteConfirm(trip.title)}>
            <button type="button" className="btn btn-outline-secondary btn-sm">
              {t.trips.detail.deleteTrip}
            </button>
          </ConfirmForm>
        </div>
      )}
    </div>
  );
}
