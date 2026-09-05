import AppLink from "@/components/AppLink";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import {
  dateKey,
  endOfDay,
  formatDuration,
  formatShortDate,
  formatShortDateRange,
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
import TripFlightChain, { type FlightChainData } from "./TripFlightChain";
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

/** Чип времени схлопнутой строки: обе стороны через стрелку. Когда время
 *  известно только с одной стороны, стрелка остаётся — видно, какое из
 *  двух это («14:00 →» заезд, «→ 12:00» выезд). Без времён чипа нет. */
function timeSpanLabel(startAt: Date, endAt: Date): string | null {
  const startTime = hasTime(startAt) ? formatTime(startAt) : null;
  const endTime = hasTime(endAt) ? formatTime(endAt) : null;
  if (startTime && endTime) return `${startTime} → ${endTime}`;
  if (startTime) return `${startTime} →`;
  if (endTime) return `→ ${endTime}`;
  return null;
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

/** Жильё с обеими датами — «стоянка»: её концы соединяет линия в ленте.
 *  Бронь с одной датой остаётся одиночной записью. Предикат общий для
 *  генерации записей и для раздачи цветов линий — чтобы условия не
 *  разъехались. */
function isStayBooking(b: {
  kind: "HOTEL" | "FLIGHT";
  startAt: Date | null;
  endAt: Date | null;
}): boolean {
  return b.kind === "HOTEL" && !!b.startAt && !!b.endAt;
}

/** Сколько цветов в палитре линий — ровно столько переменных
 *  --stay-line-1..N объявлено в globals.css. */
const STAY_LINE_COLORS = 5;

/** Активная линия стоянки в точке ленты: цвет — номер в палитре
 *  (var(--stay-line-N)), slot — дорожка, то есть на сколько шагов линия
 *  сдвинута вправо, когда стоянки пересекаются. */
type StayLine = { bookingId: string; color: number; slot: number };

/** Бронь в ленте плана — это две записи, а не одна строка сбоку:
 *  заселение в день заезда и выселение в день выезда (у перелёта — вылет
 *  и прилёт). Промежуточные дни ничем не помечаем: то, что человек живёт
 *  в отеле, и так понятно, а связь между заездом и выездом показывает
 *  линия, проходящая под карточками этих дней.
 *
 *  Заодно готовим `span` — те же две стороны одной строкой («10:20 →
 *  21:40», «12–15 мар · 3 ночи»). Лента подставит её вместо пары, если
 *  между заездом и выездом (вылетом и прилётом) не окажется ни одной
 *  другой записи: две карточки подряд про одно и то же — шум (просьба
 *  владельца). Решает это лента, а не бронь, потому что «есть ли что-то
 *  между» известно только после сортировки всех записей вместе. */
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
  stayColor: number | null,
): {
  leg: BookingLegData;
  sortAt: Date;
  isStay: boolean;
  span: BookingLegData | null;
  /** Сырые даты обеих сторон — цепочке перелётов нужны они, а не подписи. */
  spanAt: { startAt: Date; endAt: Date } | null;
}[] {
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
  const isStay = isStayBooking(b);

  // Общая шапка записи — то, что не зависит от стороны.
  const base = {
    bookingId: b.id,
    kind: b.kind,
    name: b.name,
    place,
    url: b.url,
    fileUrl: b.fileUrl,
    canEdit,
    booking: row,
  };
  const dateLabels = (at: Date) => ({
    // Подписи даты считаем здесь: даты проекта живут в UTC, а
    // локальные геттеры в браузере зрителя дали бы другой день.
    dayLabel: String(at.getUTCDate()),
    monthLabel: shortMonthName(labelDate(at), locale),
    weekdayLabel: shortWeekdayName(labelDate(at), locale),
  });

  // Схлопнутая строка: дата-колонка — по началу, чип времени — обе
  // стороны через стрелку (одна сторона без времени — стрелка остаётся,
  // чтобы было видно, какое из двух известно), а вторая дата — словами
  // в подписи: у отеля диапазон и ночи, у перелёта — «прилёт 11 мар»,
  // если сел не в день вылета.
  let span: BookingLegData | null = null;
  const spanAt = b.startAt && b.endAt ? { startAt: b.startAt, endAt: b.endAt } : null;
  if (b.startAt && b.endAt) {
    const timeLabel = timeSpanLabel(b.startAt, b.endAt);
    let spanLabel: string | null;
    if (isFlight) {
      spanLabel =
        dateKey(b.startAt) === dateKey(b.endAt)
          ? null
          : t.trips.bookings.arrivesOn(formatShortDate(b.endAt, locale));
    } else {
      const nights = nightsBetween(b.startAt, b.endAt);
      spanLabel = [
        formatShortDateRange(b.startAt, b.endAt, locale),
        nights > 0 ? t.trips.bookings.nights(nights) : null,
      ]
        .filter(Boolean)
        .join(" · ");
    }
    span = {
      ...base,
      key: `booking-${b.id}-both`,
      side: "both",
      // Линии у схлопнутой стоянки нет — соединять нечего, обе стороны в
      // одной карточке, — поэтому и иконка остаётся акцентной.
      stayColor: null,
      ...dateLabels(b.startAt),
      timeLabel,
      spanLabel,
      note: b.note,
    };
  }

  const make = (at: Date, side: "start" | "end"): ReturnType<typeof bookingLegs>[number] => {
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
      span,
      spanAt,
      leg: {
        ...base,
        key: `booking-${b.id}-${side}`,
        side,
        stayColor: isStay ? stayColor : null,
        ...dateLabels(at),
        timeLabel: hasTime(at) ? formatTime(at) : null,
        spanLabel,
        // Заметка у брони одна на обе стороны, поэтому показываем её
        // только на первой записи — иначе «код брони 4412» повторялся бы
        // и на заселении, и на выселении.
        note: side === "start" || !b.startAt ? b.note : null,
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
        include: {
          location: { select: { id: true, name: true } },
          performers: {
            include: {
              performer: { select: { id: true, name: true, slug: true, photoUrl: true } },
            },
          },
          // Только СВОЯ отметка «я там буду» — карточке хватает булева.
          attendances: { where: { userId: user.id }, select: { userId: true } },
        },
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
  const myTickets = await prisma.eventTicket.findMany({
    where: { userId: user.id, occurrenceId: { in: occIds } },
    select: { occurrenceId: true, fileUrl: true },
  });
  const ticketByOccurrence = new Map(myTickets.map((t) => [t.occurrenceId, t.fileUrl]));

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
      performers: p.performers.map((link) => link.performer),
      attending: p.attendances.length > 0,
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
  // Цвет линии — на бронь: палитра по кругу в порядке начала броней
  // (visibleBookings уже отсортированы по startAt). Так два отеля подряд
  // не читаются одним непрерывным отрезком, а первая стоянка получает
  // акцентный цвет — поездка с единственной бронью выглядит как раньше.
  const stayColorByBooking = new Map<string, number>();
  visibleBookings
    .filter(isStayBooking)
    .forEach((b, i) => stayColorByBooking.set(b.id, (i % STAY_LINE_COLORS) + 1));
  const legs = showAll
    ? []
    : visibleBookings.flatMap((b) =>
        bookingLegs(b, locale, t, canContribute, stayColorByBooking.get(b.id) ?? null),
      );
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

  type BookingEntry = {
    kind: "booking";
    startsAt: Date;
    /** У схлопнутой строки — момент второй стороны: по нему строка
     *  решает, прошедшая ли она (заезд вчера, выезд завтра — ещё нет). */
    endsAt?: Date;
    key: string;
    leg: BookingLegData;
    isStay: boolean;
    /** Обе стороны одной строкой — на случай, если рядом ничего нет. */
    span: BookingLegData | null;
    spanAt: { startAt: Date; endAt: Date } | null;
  };
  type TimelineItem =
    | { kind: "public"; startsAt: Date; key: string; event: (typeof events)[number] }
    | { kind: "personal"; startsAt: Date; key: string; personalEvent: PersonalEventData }
    | { kind: "todo"; startsAt: Date; key: string; todo: (typeof todoData)[number] }
    | BookingEntry
    | { kind: "flightChain"; startsAt: Date; endsAt: Date; key: string; chain: FlightChainData };

  const timeline: TimelineItem[] = [
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
    ...legs.map(({ leg, sortAt, isStay, span, spanAt }) => ({
      kind: "booking" as const,
      startsAt: sortAt,
      key: leg.key,
      leg,
      isStay,
      span,
      spanAt,
    })),
  ].sort(
    (a, b) =>
      a.startsAt.getTime() - b.startsAt.getTime() ||
      // Ровно в одну минуту с событием бронь идёт первой: сначала
      // заселяешься (или сдаёшь номер), потом идёшь на событие.
      (a.kind === "booking" ? 0 : 1) - (b.kind === "booking" ? 0 : 1),
  );

  // Схлопывание (просьба владельца: «если между ними нет никаких
  // событий, объединять в одну строку»): две стороны одной брони, между
  // которыми в отсортированной ленте не встало ничего — ни события, ни
  // дела, ни другой брони, — заменяем одной записью `span`. Соседство
  // проверяем по ленте целиком, а не по дню: перелёт через ночь без
  // событий между вылетом и прилётом тоже схлопывается. Порядок сторон
  // не важен (стоянка в один день без времён сортируется выездом раньше
  // заезда — см. closedEarly ниже): важно только, что они рядом.
  const paired: TimelineItem[] = [];
  for (let i = 0; i < timeline.length; i += 1) {
    const cur = timeline[i];
    const next = timeline[i + 1];
    if (
      cur.kind === "booking" &&
      cur.span &&
      next?.kind === "booking" &&
      next.leg.bookingId === cur.leg.bookingId &&
      next.leg.side !== cur.leg.side
    ) {
      paired.push({
        kind: "booking",
        startsAt: cur.startsAt,
        endsAt: next.startsAt,
        key: cur.span.key,
        leg: cur.span,
        // Линию рисовать не между чем: обе стороны в одной карточке.
        isStay: false,
        span: null,
        spanAt: cur.spanAt,
      });
      i += 1;
      continue;
    }
    paired.push(cur);
  }

  // Цепочка перелётов (выбор владельца — «вариант A»): схлопнутые
  // перелёты, идущие в ленте подряд без единой записи между ними и с
  // пересадкой короче суток, складываются в ОДНУ строку — «Минск →
  // Москва → Хайкоу → Бангкок · 2 пересадки (…)». Совпадения мест
  // сегментов не требуем: поля свободные, опечатка («Гайку») не должна
  // рвать цепочку. Общее время в пути не считаем намеренно: времена
  // местные для каждого аэропорта, без зон, и разница между Минском и
  // Бангкоком врала бы на часы. А пересадка — прилёт и следующий вылет в
  // ОДНОМ аэропорту, там разница честная. Без времени у одной из сторон
  // пересадку считаем днями (вылет в день прилёта или назавтра) и
  // показываем без длительности.
  const LAYOVER_MAX_MS = 24 * 3600_000;
  const isChainable = (e: TimelineItem): e is BookingEntry & { spanAt: { startAt: Date; endAt: Date } } =>
    e.kind === "booking" && e.leg.side === "both" && e.leg.kind === "FLIGHT" && !!e.spanAt;
  const layoverMinutes = (arriveAt: Date, departAt: Date): number | null =>
    hasTime(arriveAt) && hasTime(departAt)
      ? Math.round((departAt.getTime() - arriveAt.getTime()) / 60_000)
      : null;
  const layoverOk = (arriveAt: Date, departAt: Date): boolean => {
    const minutes = layoverMinutes(arriveAt, departAt);
    if (minutes != null) return minutes >= 0 && minutes * 60_000 < LAYOVER_MAX_MS;
    const days = nightsBetween(arriveAt, departAt);
    return days >= 0 && days <= 1;
  };
  const samePlace = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const buildChain = (group: (BookingEntry & { spanAt: { startAt: Date; endAt: Date } })[]): TimelineItem => {
    const first = group[0];
    const last = group[group.length - 1];
    // Маршрут — все места по порядку без повторов подряд: «Москва →
    // Москва» на стыке сегментов схлопывается в одну точку.
    const stops: string[] = [];
    for (const e of group) {
      for (const place of [e.leg.booking.fromPlace, e.leg.booking.toPlace]) {
        if (place && (stops.length === 0 || !samePlace(stops[stops.length - 1], place))) stops.push(place);
      }
    }
    const layovers = group.slice(0, -1).map((e, i) => {
      const next = group[i + 1];
      const place = e.leg.booking.toPlace ?? next.leg.booking.fromPlace;
      const minutes = layoverMinutes(e.spanAt.endAt, next.spanAt.startAt);
      return [place, minutes != null ? formatDuration(minutes, locale) : null].filter(Boolean).join(" ");
    });
    const layoverDetails = layovers.filter(Boolean);
    const spanLabel = [
      `${t.trips.bookings.layovers(layovers.length)}${layoverDetails.length > 0 ? ` (${layoverDetails.join(", ")})` : ""}`,
      dateKey(first.spanAt.startAt) === dateKey(last.spanAt.endAt)
        ? null
        : t.trips.bookings.arrivesOn(formatShortDate(last.spanAt.endAt, locale)),
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      kind: "flightChain",
      startsAt: first.startsAt,
      endsAt: last.spanAt.endAt,
      key: `chain-${group.map((e) => e.leg.bookingId).join("-")}`,
      chain: {
        key: `chain-${first.leg.bookingId}`,
        dayLabel: first.leg.dayLabel,
        monthLabel: first.leg.monthLabel,
        weekdayLabel: first.leg.weekdayLabel,
        timeLabel: timeSpanLabel(first.spanAt.startAt, last.spanAt.endAt),
        names: group.map((e) => e.leg.name).join(" · "),
        route: stops.join(" → ") || null,
        spanLabel,
        legs: group.map((e) => e.leg),
      },
    };
  };
  const entries: TimelineItem[] = [];
  for (let i = 0; i < paired.length; ) {
    const cur = paired[i];
    if (!isChainable(cur)) {
      entries.push(cur);
      i += 1;
      continue;
    }
    const group = [cur];
    let j = i + 1;
    while (j < paired.length) {
      const next = paired[j];
      if (!isChainable(next) || !layoverOk(group[group.length - 1].spanAt.endAt, next.spanAt.startAt)) break;
      group.push(next);
      j += 1;
    }
    entries.push(group.length >= 2 ? buildChain(group) : cur);
    i = j;
  }

  // Линии жилья: заезд и выезд каждой стоянки соединяет вертикальная
  // линия в зазорах между карточками. Считаем по уже отсортированной
  // ленте, но не счётчиком, а СПИСКОМ активных стоянок: у каждой свой
  // цвет и своя дорожка (сдвиг вправо), иначе пересекающиеся брони
  // (переезд внахлёст) сливались бы в один отрезок, как и два отеля
  // подряд. Строке отдаём снимок линий, проходящих через зазор НАД ней:
  // сегмент в зазоре рисует нижняя из двух строк, поэтому заезд попадает
  // в активные ПОСЛЕ своего снимка (его линия начинается ниже него), а
  // выезд выбывает тоже после снимка (его сегмент над ним — последний).
  const rows: { item: TimelineItem; lines: StayLine[] }[] = [];
  const activeStays: StayLine[] = [];
  // Стоянка в одну ночёвку без времён сортируется выездом РАНЬШЕ заезда
  // (выезд прижат к началу дня, заезд — к концу). Такую не открываем
  // вовсе: непарная линия дотянулась бы до конца ленты.
  const closedEarly = new Set<string>();
  for (const item of entries) {
    const stayLeg = item.kind === "booking" && item.isStay ? item.leg : null;
    rows.push({ item, lines: [...activeStays] });
    if (!stayLeg) continue;
    if (stayLeg.side === "start") {
      if (closedEarly.has(stayLeg.bookingId)) continue;
      // Дорожка — первый свободный сдвиг, а не длина списка: место
      // закрывшейся стоянки занимает следующая, и линии не уползают
      // вправо без нужды. Дорожка одна на всю стоянку — линия ровная.
      const usedSlots = new Set(activeStays.map((s) => s.slot));
      let slot = 0;
      while (usedSlots.has(slot)) slot += 1;
      activeStays.push({ bookingId: stayLeg.bookingId, color: stayLeg.stayColor ?? 1, slot });
    } else {
      const idx = activeStays.findIndex((s) => s.bookingId === stayLeg.bookingId);
      if (idx >= 0) activeStays.splice(idx, 1);
      else closedEarly.add(stayLeg.bookingId);
    }
  }

  // И18: во время поездки лента начиналась со вчерашнего и позавчерашнего,
  // и до «сегодня» приходилось мотать. Прошедшие дни сворачиваем в одну
  // строку «Прошло N дней» (раскрывается кликом — история не пропадает).
  // У ПРОШЕДШЕЙ поездки не сворачиваем ничего (просьба владельца): её
  // открывают ради истории, прятать которую бессмысленно; у будущей
  // прошедших записей нет и так. «Сегодня» — по бангкокскому настенному
  // времени, как все даты проекта (см. lib/dates.ts).
  const bkkNow = new Date();
  bkkNow.setUTCHours(bkkNow.getUTCHours() + 7);
  const bkkTodayKey = dateKey(bkkNow);
  const tripFinished = dateKey(trip.endDate) < bkkTodayKey;
  // Схлопнутая бронь и цепочка перелётов прошли, только когда прошла
  // их вторая сторона: заезд позавчера с выездом завтра — это текущее
  // жильё, а не история.
  const isPastRow = (r: (typeof rows)[number]) =>
    dateKey("endsAt" in r.item && r.item.endsAt ? r.item.endsAt : r.item.startsAt) < bkkTodayKey;
  const pastRows = tripFinished ? [] : rows.filter(isPastRow);
  const visibleRows = tripFinished ? rows : rows.filter((r) => !isPastRow(r));
  const pastDayCount = new Set(pastRows.map((r) => dateKey(r.item.startsAt))).size;

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

  // Разметка одной строки ленты — используется и в видимой части, и в
  // свёрнутых прошедших днях (И18), чтобы им нечему было разъезжаться.
  const renderTimelineRow = ({ item, lines }: (typeof rows)[number]) => {
    const stayLeg = item.kind === "booking" && item.isStay ? item.leg : null;
    // Классы стоянки — маркеры: стилям нужен только in-stay
    // (позиционный контекст для полосок), а stay-open/stay-close
    // держим ради e2e-теста приватности броней — он по этим
    // строкам проверяет, что разметка брони не утекает
    // постороннему (tests/e2e/trip-booking-privacy.spec.ts).
    const stayClasses = `${lines.length > 0 || stayLeg ? " in-stay" : ""}${
      stayLeg ? (stayLeg.side === "start" ? " stay-open" : " stay-close") : ""
    }`;
    return (
      <div key={item.key} className={`trip-timeline-item${stayClasses}`}>
        {/* Куски линий в зазоре над строкой — по полоске на каждую
            проходящую стоянку. Цвет и дорожку CSS берёт из инлайн-
            переменных; шаг дорожки 6px — чтобы параллельные линии
            (2px + просвет) не слипались, но оставались под числом
            даты. */}
        {lines.map((line) => (
          <span
            key={line.bookingId}
            className="stay-line"
            aria-hidden
            style={
              {
                "--stay-color": `var(--stay-line-${line.color})`,
                "--stay-offset": `${line.slot * 6}px`,
              } as React.CSSProperties
            }
          />
        ))}
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
            canAttend={isParticipant}
            showShareToggle={isShared}
            visibilityOptions={visibilityOptions}
          />
        ) : item.kind === "booking" ? (
          <TripBookingLeg tripId={trip.id} leg={item.leg} visibilityOptions={visibilityOptions} />
        ) : item.kind === "flightChain" ? (
          <TripFlightChain tripId={trip.id} chain={item.chain} visibilityOptions={visibilityOptions} />
        ) : (
          <TodoRow
            todo={item.todo}
            showDate
            showShareToggle={isShared}
            visibilityOptions={visibilityOptions}
          />
        )}
      </div>
    );
  };

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
      ) : entries.length === 0 ? (
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
          {/* Прошедшие дни — свёрнуты (И18); разметка строк внутри та же,
              что и у видимых, поэтому e2e приватности броней видит свои
              stay-open/stay-close и в свёрнутом виде. */}
          {pastRows.length > 0 && (
            <details className="trip-past-days">
              <summary>{t.trips.detail.pastDays(pastDayCount)}</summary>
              <div className="d-flex flex-column gap-3 trip-timeline mt-3">
                {pastRows.map(renderTimelineRow)}
              </div>
            </details>
          )}
          {visibleRows.map(renderTimelineRow)}
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
