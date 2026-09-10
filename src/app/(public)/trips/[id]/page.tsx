import type { TripTodoKind } from "@/generated/prisma/client";
import { cache } from "react";
import AppLink from "@/components/AppLink";
import ScrollableTabs from "@/components/ScrollableTabs";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { catalogOccurrencesWhere } from "@/lib/catalogEvents";
import { getCurrentUser } from "@/lib/userAuth";
import {
  dateKey,
  endOfDay,
  formatDuration,
  formatShortDate,
  formatTime,
  shortMonthName,
  shortWeekdayName,
  startOfDay,
} from "@/lib/dates";
import { getT, type Dict, type Locale } from "@/lib/i18n";
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
import TripTodos, { AddTripTodoButton, TodoRow } from "../TripTodos";
import TripMembersButton, { TripInviteActions } from "../TripMembersControls";
import TripStayButton from "../TripStayButton";
import { VisibilitySelect } from "../TripVisibilityControls";
import EditTripButton from "../EditTripButton";
import LocationMapLoader from "@/components/LocationMapLoader";
import {
  AttachListSelect,
  DetachListButton,
  RemoveTripPlaceButton,
} from "../TripPlacesControls";
import EventCardLocked from "@/components/EventCardLocked";
import { isPremiumActive } from "@/lib/premium";
import { listHref, locationHref, slugOrIdWhere, tripHref } from "@/lib/slugHelpers";
import { buildDayRoute } from "@/lib/dayRoute";
import { pageMetadata } from "@/lib/seo";
import { userHref, userDisplayName } from "@/lib/userProfile";
import TripBookings from "./TripBookings";
import AddBookingButton from "./AddBookingButton";
import AddTripPlaceButton from "../AddTripPlaceButton";
import TripBookingLeg, { type BookingLegData, type DateRangeLabels } from "./TripBookingLeg";
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

/** Дата-колонка многодневной строки: «4–5» + «апр» в одном месяце,
 *  «28 февр –» + «2 мар» на стыке (см. BookingDateColumn). null — один
 *  день, колонка обычная. */
function dateRangeLabels(from: Date, to: Date, locale: Locale): DateRangeLabels | null {
  if (dateKey(from) === dateKey(to)) return null;
  if (from.getUTCFullYear() === to.getUTCFullYear() && from.getUTCMonth() === to.getUTCMonth()) {
    return {
      top: `${from.getUTCDate()}–${to.getUTCDate()}`,
      bottom: shortMonthName(labelDate(from), locale),
      sameMonth: true,
    };
  }
  return {
    top: `${formatShortDate(from, locale)} –`,
    bottom: formatShortDate(to, locale),
    sameMonth: false,
  };
}

/** Дата прилёта для чипа перелёта — только если сел не в день вылета;
 *  тем же коротким форматом, что и остальные даты строк. */
function arrivalDateLabel(startAt: Date, endAt: Date, locale: Locale): string | null {
  return dateKey(startAt) === dateKey(endAt) ? null : formatShortDate(endAt, locale);
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
  // чтобы было видно, какое из двух известно), а вторая дата — словами:
  // у отеля диапазон и ночи в подписи, у перелёта — дата прилёта прямо
  // в чипе, если сел не в день вылета.
  let span: BookingLegData | null = null;
  const spanAt = b.startAt && b.endAt ? { startAt: b.startAt, endAt: b.endAt } : null;
  if (b.startAt && b.endAt) {
    const timeLabel = timeSpanLabel(b.startAt, b.endAt);
    let spanLabel: string | null;
    if (isFlight) {
      // Дата прилёта живёт в чипе (arrivalDateLabel ниже), подпись под
      // строкой — только маршрут.
      spanLabel = null;
    } else {
      // Диапазон дат у отеля — в дата-колонке (dateRange), в подписи
      // остаются только ночи.
      const nights = nightsBetween(b.startAt, b.endAt);
      spanLabel = nights > 0 ? t.trips.bookings.nights(nights) : null;
    }
    span = {
      ...base,
      key: `booking-${b.id}-both`,
      side: "both",
      // Линии у схлопнутой стоянки нет — соединять нечего, обе стороны в
      // одной карточке, — поэтому и иконка остаётся акцентной.
      stayColor: null,
      ...dateLabels(b.startAt),
      dateRange: dateRangeLabels(b.startAt, b.endAt, locale),
      timeLabel,
      // Дата прилёта в чипе — только у перелёта: у отеля ночи и
      // диапазон дат уже в подписи (решение владельца).
      arrivalDateLabel: isFlight ? arrivalDateLabel(b.startAt, b.endAt, locale) : null,
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
        dateRange: null,
        timeLabel: hasTime(at) ? formatTime(at) : null,
        arrivalDateLabel: null,
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

// React.cache: generateMetadata и страница делят ОДИН запрос на
// HTTP-запрос (по образцу artists/[id]) — раньше метадата ходила в базу
// отдельным select, и поездка искалась дважды. getCurrentUser внутри
// сам под React.cache (см. lib/userAuth.ts), лишней сессии не будет;
// зритель нужен подзапросу attendances — «я там буду» тянется только
// своё, карточке хватает булева.
const getTrip = cache(async (rawParam: string) => {
  const viewerId = (await getCurrentUser())?.id ?? null;
  return prisma.trip.findFirst({
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
          // Своя отметка «я там буду». У гостя её быть не может —
          // подставляем заведомо несуществующий id, чтобы не городить
          // две ветки запроса.
          attendances: { where: { userId: viewerId ?? "" }, select: { userId: true } },
        },
      },
      user: { select: { id: true, name: true, username: true, deletedAt: true } },
      // Свои даты участников (АА17): нет строки — едет на всю поездку.
      stays: { select: { userId: true, startDate: true, endDate: true } },
      // Брони жилья: показываются на вкладке плана рядом с событиями —
      // в день заселения не приходится искать письмо в почте.
      bookings: { orderBy: [{ startAt: "asc" }, { createdAt: "asc" }] },
      members: {
        // username — не для ссылки, а для ПОДПИСИ: userDisplayName без
        // него не может откатиться на ник и зовёт человека безликим
        // «Пользователем» (поймано на проверке имён 2026-09-06).
        include: { user: { select: { id: true, name: true, username: true, deletedAt: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
});

/**
 * Поездка открыта по прямой ссылке, но в поиске ей не место: это личная
 * страница человека — как и профиль, она уходит с `noindex` (правка
 * владельца 2026-09-06). Закрытые поездки сюда даже не доходят —
 * страница отдаёт им 404, — но заголовок в метаданных мы не показываем
 * никому лишнему: он берётся только для публичной.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { locale, t } = await getT();
  const trip = await getTrip(id);
  return pageMetadata({
    title: trip && trip.visibility === "PUBLIC" ? trip.title : t.trips.list.metaTitle,
    description: t.trips.list.metaDescription,
    path: `/trips/${id}`,
    noIndex: true,
    locale,
  });
}

/** Три вкладки списков подряд: дела, чемодан, покупки. */
const TODO_TABS: {
  kind: TripTodoKind;
  view: string;
  label: (t: Dict, n: number) => string;
}[] = [
  { kind: "TODO", view: "todos", label: (t, n) => t.trips.detail.tabTodos(n) },
  { kind: "PACKING", view: "packing", label: (t, n) => t.trips.detail.tabPacking(n) },
  { kind: "SHOPPING", view: "shopping", label: (t, n) => t.trips.detail.tabShopping(n) },
];

export default async function TripPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string; mine?: string }>;
}) {
  const { locale, t } = await getT();
  // Гостя со страницы больше не гоним: ПУБЛИЧНОЙ поездкой делятся
  // ссылкой, и половина адресатов на сайте не зарегистрирована (правка
  // владельца 2026-09-06). Дальше страница написана null-safe: гость
  // идёт теми же ветками, что залогиненный посторонний, а закрытость
  // считает видимость поездки — ровно как у профиля.
  const user = await getCurrentUser();
  const viewerId = user?.id ?? null;

  const { id: rawParam } = await params;
  const { view, mine } = await searchParams;
  // «Мой план» (по умолчанию) — только события, куда идёт владелец
  // поездки; ?view=all — вкладка «Афиша», все события этих дат из
  // афиши (без личных записей и дел); ?view=places — «что
  // посетить»: локации съёмок сериалов владельца. Для гостей план
  // владельца — и есть смысл расшаренной поездки.
  const showAll = view === "all";
  const showPlaces = view === "places";
  // У каждого списка своя вкладка: дела, чемодан, покупки (АА10/АА11 +
  // правка владельца 2026-09-06 — сегменты внутри одной вкладки читались
  // хуже, чем три честные вкладки).
  const showTodos = view === "todos" || view === "packing" || view === "shopping";
  const activeList: TripTodoKind =
    view === "packing" ? "PACKING" : view === "shopping" ? "SHOPPING" : "TODO";
  // Тот же React.cache-запрос, что и в generateMetadata, — Prisma
  // дёргается один раз на HTTP-запрос.
  const trip = await getTrip(rawParam);
  if (!trip) notFound();

  // Доступ по видимости: PRIVATE — только владелец, FRIENDS — владелец и
  // его принятые друзья, PUBLIC — любой залогиненный. Чужому 404, а не
  // 403 — не подтверждаем само существование поездки.
  const isOwner = trip.userId === viewerId;
  // Совместная поездка: принявшие инвайт участники (ACCEPTED) видят её
  // независимо от видимости и наравне с владельцем вносят события/дела.
  // PENDING — приглашение: видит страницу с баннером «принять/отклонить»,
  // но не личное/дела.
  const myMembership = trip.members.find((m) => m.userId === viewerId);
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
      // Гость другом быть не может — ему сюда нельзя, как и чужому.
      if (!viewerId) notFound();
      const ownerFriendIds = await getFriendIds(trip.userId);
      if (!ownerFriendIds.includes(viewerId)) notFound();
    }
  }

  // События афиши — список, а списки у нас под подпиской (в поиске этот
  // обход пейволла уже ловили). Участникам поездки план виден целиком:
  // это их собственные отметки «иду».
  const canSeeEvents = isParticipant || isPremiumActive(user);

  const myStay = viewerId ? trip.stays.find((stay) => stay.userId === viewerId) ?? null : null;
  /** «22 окт – 6 нояб» для чужого окна присутствия; null — вся поездка. */
  const stayLabelOf = (userId: string): string | null => {
    const stay = trip.stays.find((row) => row.userId === userId);
    return stay
      ? `${formatShortDate(stay.startDate, locale)} – ${formatShortDate(stay.endDate, locale)}`
      : null;
  };
  // Кто в какой день прилетает и улетает — бейджами в ленте (АА17).
  // Владелец и участники равны: у каждого либо своё окно, либо вся
  // поездка (тогда стрелок нет — прилёт совпадает с началом поездки, и
  // подписывать его нечем).
  const stayByDay = new Map<string, { userId: string; kind: "arrive" | "leave" }[]>();
  for (const stay of trip.stays) {
    for (const [date, kind] of [
      [dateKey(stay.startDate), "arrive" as const],
      [dateKey(stay.endDate), "leave" as const],
    ] as const) {
      const day = stayByDay.get(date);
      if (day) day.push({ userId: stay.userId, kind });
      else stayByDay.set(date, [{ userId: stay.userId, kind }]);
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

  // Рамка поездки — ОБЪЕДИНЕНИЕ её дат и всех окон присутствия (АА17):
  // подруга прилетает позже и улетает позже, и её последний день обязан
  // попасть в ленту — иначе событие, на которое идёт она одна, просто
  // не показывалось бы никому (поймано проверкой 2026-09-06). Обычно
  // рамку раздвигает уже сам setTripStay; здесь — на случай окон,
  // заведённых другим путём, и поездок, которые потом сузили.
  const rangeStart = trip.stays.reduce(
    (min, stay) => (stay.startDate < min ? stay.startDate : min),
    trip.startDate,
  );
  const rangeEnd = trip.stays.reduce(
    (max, stay) => (stay.endDate > max ? stay.endDate : max),
    trip.endDate,
  );
  // План поездки собирается из афиши: встречи сообществ в него не идут
  // (см. src/lib/catalogEvents.ts) — у поездки свои личные события.
  const rangeWhere = {
    ...catalogOccurrencesWhere(),
    startsAt: { gte: rangeStart, lte: endOfDay(rangeEnd) },
  };
  // Отдельного счётчика плана больше нет (у вкладки убрана цифра), так
  // что и запрос под него не нужен — остался только счётчик «Афиши».
  //
  // Дела, счётчик «Что посетить» и содержимое этой вкладки не зависят
  // ни от событий, ни друг от друга — раньше они ждали своей очереди
  // хвостом последовательных стадий (аудит 2026-09, п.4), теперь едут
  // одним залпом с афишей. Сами данные и их обработка не менялись —
  // только порядок ожидания.
  const [[occurrences, totalCount], todos, [tripLists, tripPlaces, myLists], placeIdRows] =
    await Promise.all([
      Promise.all([
        prisma.eventOccurrence.findMany({
          where: {
            ...rangeWhere,
            // План совместной поездки — отметки «иду» всех участников;
            // «Только моё» сужает до текущего юзера.
            ...(showAll
              ? {}
              : {
                  attendances: {
                    some: { userId: onlyMine && viewerId ? viewerId : { in: participantIds } },
                  },
                }),
          },
          include: { event: { include: { performers: { include: { performer: { select: { id: true, name: true, slug: true } } } } } } },
          orderBy: { startsAt: "asc" },
        }),
        prisma.eventOccurrence.count({ where: rangeWhere }),
      ]),
      // Дела поездки: кого пускать к каждому, решает его видимость —
      // фильтр canSeeItem стоит ниже, у него (см. todoData).
      prisma.tripTodo.findMany({
        where: { tripId: trip.id },
        orderBy: [{ done: "asc" }, { date: "asc" }],
      }),
      // «Что посетить» (Г4): прикреплённые списки мест + отдельные
      // добавленные места (+ свои списки для селекта прикрепления) —
      // только на самой вкладке.
      showPlaces
        ? Promise.all([
            prisma.tripPlaceList.findMany({
              where: { tripId: trip.id },
              include: { list: { include: { items: { include: { location: true } } } } },
            }),
            prisma.tripPlace.findMany({
              where: { tripId: trip.id },
              include: { location: true },
            }),
            isParticipant && viewerId
              ? prisma.placeList.findMany({
                  where: { userId: viewerId },
                  select: { id: true, title: true },
                  orderBy: { createdAt: "desc" },
                })
              : Promise.resolve([]),
          ])
        : [[], [], []],
      // Счётчик в подписи вкладки «Что посетить» (правка владельца
      // 2026-09-07). Считаем ВСЕГДА, а не только на самой вкладке:
      // подпись видна с любой другой. Локации приезжают двумя путями —
      // из прикреплённых списков и поштучно, — и одно и то же место
      // может быть и там, и там, поэтому считаем разные, а не сумму.
      prisma.location.findMany({
        where: {
          OR: [
            { tripPlaces: { some: { tripId: trip.id } } },
            { listItems: { some: { list: { trips: { some: { tripId: trip.id } } } } } },
          ],
        },
        select: { id: true },
      }),
    ]);
  const events = occurrences.map(flattenOccurrence);

  const eventIds = events.map((ev) => ev.id);
  const occIds = events.map((ev) => ev.occurrenceId);
  // Личное к событиям (избранное, «иду», кто из друзей идёт, билеты 🎫
  // в карточку) есть только у залогиненного: гостю нечего показывать и
  // не за кем ходить в базу. Всё четыре зависят лишь от списка событий
  // и друг друга не ждут (аудит 2026-09, п.4).
  const [favoritedIds, goingIds, friendIds, myTickets] = viewerId
    ? await Promise.all([
        getFavoritedEventIds(eventIds, viewerId),
        getGoingOccurrenceIds(occIds, viewerId),
        getFriendIds(viewerId),
        prisma.eventTicket.findMany({
          where: { userId: viewerId, occurrenceId: { in: occIds } },
          select: { occurrenceId: true, fileUrl: true },
        }),
      ])
    : [
        new Set<string>(),
        new Set<string>(),
        [] as string[],
        [] as { occurrenceId: string | null; fileUrl: string }[],
      ];
  const ticketByOccurrence = new Map(myTickets.map((t) => [t.occurrenceId, t.fileUrl]));

  // Кандидаты в участники — друзья владельца, которых ещё нет в поездке
  // (friendIds для владельца — его же друзья). «Кто из друзей идёт»
  // ждёт того же friendIds — обоим запросам одна очередь.
  const memberIdSet = new Set(trip.members.map((m) => m.userId));
  const [friendsGoingByEvent, availableFriends] = await Promise.all([
    getFriendsGoingByOccurrence(occIds, friendIds),
    isOwner
      ? prisma.user.findMany({
          where: { id: { in: friendIds.filter((id) => !memberIdSet.has(id)) } },
          select: { id: true, name: true, deletedAt: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  // Право менять конкретную запись: автор, владелец поездки или другой
  // участник, если автор разрешил галочкой (editableByOthers).
  const canTouch = (item: { createdById: string | null; editableByOthers: boolean }): boolean => {
    if (!canContribute) return false;
    const authorId = item.createdById ?? trip.userId;
    return authorId === viewerId || isOwner || item.editableByOthers;
  };
  const isMine = (createdById: string | null): boolean =>
    (createdById ?? trip.userId) === viewerId;
  // У брони галочки editableByOthers нет, поэтому карандаш — автору и
  // владельцу поездки: ровно то, что пропустит guardBookingTouch на
  // сервере (аудит 2026-09, п.1.1). Раньше canEdit был общим
  // canContribute — участник видел карандаш на чужой брони, и сервер
  // правку не останавливал.
  const canTouchBooking = (b: { createdById: string | null }): boolean =>
    canTouch({ createdById: b.createdById, editableByOthers: false });

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
    if (authorId === viewerId) return true;
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
      url: p.url,
      performers: p.performers.map((link) => link.performer),
      attending: p.attendances.length > 0,
      canEdit: canTouch(p),
    }));
  // Дела поездки (загружены залпом выше): кого пускать к каждому,
  // решает его видимость.
  const todoData = todos
    .filter((t) => canSeeItem(t.visibility, t.createdById))
    .filter((t) => !onlyMine || isMine(t.createdById))
    .map((t) => ({
      id: t.id,
      text: t.text,
      kind: t.kind,
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
    // Автор брони, а не «владелец поездки по умолчанию»: приватная
    // бронь участницы принадлежит ЕЙ (см. TripBooking.createdById).
    .filter((b) => canSeeItem(b.visibility, b.createdById))
    .filter((b) => !onlyMine || isMine(b.createdById))
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
        bookingLegs(b, locale, t, canTouchBooking(b), stayColorByBooking.get(b.id) ?? null),
      );
  const undatedBookings: (TripBookingRow & { canEdit: boolean })[] = visibleBookings
    .filter((b) => !b.startAt && !b.endAt)
    .map((b) => ({
      canEdit: canTouchBooking(b),
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
    // АА17: «прилетает Аня» / «вы улетаете» — отметка в своём дне.
    // `dateLabel` — само число: у соседей по ленте дата своя (карточка
    // события, строка дела), а отметка была единственной строкой без
    // неё, и «когда» из неё не читалось (правка владельца 2026-09-10).
    | { kind: "stay"; startsAt: Date; key: string; label: string; dateLabel: string }
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
    // Прилёты и отъезды участников со своими датами (АА17): строкой в
    // своём дне, чтобы было видно, с какого числа мы вместе. На
    // «Афише» их нет — там только события.
    //
    // Показываем ТОЛЬКО участникам: кто когда прилетает — это про
    // людей, а постороннему в публичной поездке не виден даже список
    // участников (поймано проверкой совместной поездки 2026-09-06).
    ...(showAll || !isParticipant
      ? []
      : [...stayByDay].flatMap(([date, marks]) =>
          marks.flatMap((mark) => {
            const isMe = mark.userId === viewerId;
            // Только имя из аккаунта (userDisplayName в nameById): «друг»,
            // «подруга» и прочие догадки о родстве недопустимы — мы не
            // знаем, кто кому кто (правка владельца 2026-09-06). Кого нет
            // среди участников (вышел из поездки, а окно осталось) —
            // отметку не рисуем вовсе, называть его нечем.
            const name = nameById.get(mark.userId);
            if (!name) return [];
            return {
              kind: "stay" as const,
              // Полдень: отметка дня стоит между утренними и вечерними
              // делами ровно так же, как бронь без времени.
              startsAt: new Date(`${date}T12:00:00.000Z`),
              key: `stay-${mark.userId}-${mark.kind}`,
              dateLabel: formatShortDate(new Date(`${date}T12:00:00.000Z`), locale),
              label:
                mark.kind === "arrive"
                  ? isMe
                    ? t.trips.stay.arrivesYou
                    : t.trips.stay.arrives(name)
                  : isMe
                    ? t.trips.stay.leavesYou
                    : t.trips.stay.leaves(name),
            };
          }),
        )),
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
  // Москва (пересадка 5 ч 20 мин) → Хайкоу (…) → Бангкок». Совпадения мест
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
    // Маршрут — все места по порядку без повторов подряд («Москва →
    // Москва» на стыке сегментов схлопывается в одну точку), а пересадка
    // пишется в скобках прямо у своего места (просьба владельца), не
    // отдельным списком. На стыке без известного места скобки встают
    // самостоятельным пунктом — пересадка была, просто неизвестно где.
    // Место и пометка держатся порознь до самого конца: повтор ищется
    // по месту, иначе «Москва (пересадка …)» не совпала бы с «Москва».
    const stops: { place: string | null; layover: string | null }[] = [];
    const pushStop = (place: string | null) => {
      const prev = stops[stops.length - 1];
      if (place && (!prev?.place || !samePlace(prev.place, place))) stops.push({ place, layover: null });
    };
    group.forEach((e, i) => {
      pushStop(e.leg.booking.fromPlace);
      pushStop(e.leg.booking.toPlace);
      if (i === group.length - 1) return;
      const minutes = layoverMinutes(e.spanAt.endAt, group[i + 1].spanAt.startAt);
      const layover = `(${
        minutes != null
          ? t.trips.bookings.layoverFor(formatDuration(minutes, locale))
          : t.trips.bookings.layover
      })`;
      const prev = stops[stops.length - 1];
      if (prev?.place && !prev.layover) prev.layover = layover;
      else stops.push({ place: null, layover });
    });
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
        dateRange: dateRangeLabels(first.spanAt.startAt, last.spanAt.endAt, locale),
        timeLabel: timeSpanLabel(first.spanAt.startAt, last.spanAt.endAt),
        arrivalDateLabel: arrivalDateLabel(first.spanAt.startAt, last.spanAt.endAt, locale),
        names: group.map((e) => e.leg.name).join(" · "),
        route: stops.map((s) => [s.place, s.layover].filter(Boolean).join(" ")).join(" → ") || null,
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
  const tripFinished = dateKey(rangeEnd) < bkkTodayKey;
  // Схлопнутая бронь и цепочка перелётов прошли, только когда прошла
  // их вторая сторона: заезд позавчера с выездом завтра — это текущее
  // жильё, а не история.
  const isPastRow = (r: (typeof rows)[number]) =>
    dateKey("endsAt" in r.item && r.item.endsAt ? r.item.endsAt : r.item.startsAt) < bkkTodayKey;
  const pastRows = tripFinished ? [] : rows.filter(isPastRow);
  const visibleRows = tripFinished ? rows : rows.filter((r) => !isPastRow(r));
  const pastDayCount = new Set(pastRows.map((r) => dateKey(r.item.startsAt))).size;

  // «Что посетить» (загружено залпом выше): готовим селект прикрепления
  // и счётчик вкладки.
  const attachedListIds = new Set(tripLists.map((t) => t.listId));
  const availableLists = myLists.filter((l) => !attachedListIds.has(l.id));
  const placesCount = placeIdRows.length;

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
          canSeeEvents ? (
            <EventCard
              event={item.event}
              isFavorited={favoritedIds.has(item.event.id)}
              isGoing={goingIds.has(item.event.occurrenceId)}
              friendsGoing={friendsGoingByEvent.get(item.event.occurrenceId) ?? []}
              ticketUrl={ticketByOccurrence.get(item.event.occurrenceId) ?? null}
            />
          ) : (
            // Постороннему без подписки — дата и заглушка вместо
            // названия: настоящие данные события в разметку не
            // попадают вовсе (та же карточка, что в поиске).
            <EventCardLocked startsAt={item.event.startsAt} />
          )
        ) : item.kind === "personal" ? (
          <PersonalEventCard
            tripId={trip.id}
            event={item.personalEvent}
            canEdit={item.personalEvent.canEdit}
            canAttend={isParticipant}
            showShareToggle={isShared}
            visibilityOptions={visibilityOptions}
          />
        ) : item.kind === "stay" ? (
          // Тихая строка-отметка: не карточка — у неё нет ни своей
          // страницы, ни действий, это просто веха дня. Дата — приглушённо
          // следом: у остальных строк ленты она своя, и без неё отметка
          // не отвечала на «когда».
          <p className="trip-stay-mark mb-0">
            {item.label}
            <span className="text-secondary"> · {item.dateLabel}</span>
          </p>
        ) : item.kind === "booking" ? (
          <TripBookingLeg tripId={trip.id} leg={item.leg} visibilityOptions={visibilityOptions} />
        ) : item.kind === "flightChain" ? (
          <TripFlightChain tripId={trip.id} chain={item.chain} visibilityOptions={visibilityOptions} />
        ) : (
          <TodoRow
            showKind
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
                  startKey: dateKey(rangeStart),
                  endKey: dateKey(rangeEnd),
                }}
              />
            )}
          </h1>
          <p className="text-secondary mb-0">
            {formatShortDate(rangeStart, locale)} – {formatShortDate(rangeEnd, locale)}{" "}
            {rangeEnd.getFullYear()}
          </p>
        </div>
        {isParticipant ? (
          <div className="d-flex align-items-center gap-2 flex-wrap">
            {canManage && (
              <VisibilitySelect tripId={trip.id} visibility={trip.visibility} />
            )}
            {/* Своё окно присутствия — у каждого участника, включая
                владельца (АА17). */}
            <TripStayButton
              tripId={trip.id}
              startDate={myStay ? dateKey(myStay.startDate) : null}
              endDate={myStay ? dateKey(myStay.endDate) : null}
              label={viewerId ? stayLabelOf(viewerId) : null}
            />
            <TripMembersButton
              tripId={trip.id}
              isOwner={isOwner}
              owner={{
                id: trip.userId,
                name: trip.user.name,
                deletedAt: trip.user.deletedAt,
                stay: stayLabelOf(trip.userId),
              }}
              members={trip.members.map((m) => ({
                id: m.userId,
                name: m.user.name,
                deletedAt: m.user.deletedAt,
                pending: m.status === "PENDING",
                stay: stayLabelOf(m.userId),
              }))}
              availableFriends={availableFriends}
            />
          </div>
        ) : (
          <AppLink
            href={userHref(trip.user)}
            className="small text-secondary text-decoration-none"
          >
            {/* Всегда «поездка <имя>»: «поездка друга» — догадка об
                отношениях (правка владельца 2026-09-06). */}
            {t.trips.detail.ofUser(userDisplayName(trip.user, locale))}
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
          чаще всего. «+ Дело» стоит здесь же и внутри вкладки «Дела»
          больше не дублируется (просьба владельца). */}
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
          {/* Дело заводят и с плана, и из «Что посетить» — его кнопка
              живёт в общем ряду и всегда зовётся одинаково. У чемодана и
              покупок добавление своё, внутри их вкладок. */}
          <AddTripTodoButton
            tripId={trip.id}
            showShareToggle={isShared}
            visibilityOptions={visibilityOptions}
          />
          <AddTripPlaceButton tripId={trip.id} />
        </div>
      )}

      <div className="tab-bar-row">
        <ScrollableTabs>
          <AppLink
            href={tripHref(trip)}
            prefetch={false}
            className={`tab-bar-item ${!showAll && !showPlaces && !showTodos ? "active" : ""}`}
          >
            {!isShared && isOwner ? t.trips.detail.tabMyPlan() : t.trips.detail.tabPlan()}
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
          {(isParticipant || todoData.length > 0) &&
            TODO_TABS.map(({ kind, view: tabView, label }) => (
              <AppLink
                key={kind}
                href={`${tripHref(trip)}?view=${tabView}`}
                prefetch={false}
                className={`tab-bar-item ${showTodos && activeList === kind ? "active" : ""}`}
              >
                {label(t, todoData.filter((item) => item.kind === kind).length)}
              </AppLink>
            ))}
          <AppLink
            href={`${tripHref(trip)}?view=places`}
            prefetch={false}
            className={`tab-bar-item ${showPlaces ? "active" : ""}`}
          >
            {t.trips.detail.tabPlaces(placesCount)}
          </AppLink>
        </ScrollableTabs>
        {isShared && isParticipant && !showAll && !showPlaces && (
          <AppLink
            href={`${tripHref(trip)}${showTodos ? `?view=${TODO_TABS.find((tab) => tab.kind === activeList)!.view}` : ""}${onlyMine ? "" : showTodos ? "&mine=1" : "?mine=1"}`}
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
          bookings={undatedBookings}
          visibilityOptions={visibilityOptions}
        />
      )}

      {showTodos ? (
        <TripTodos
          tripId={trip.id}
          todos={todoData.filter((item) => item.kind === activeList)}
          activeList={activeList}
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
            {/* Поиск места и «своё место» переехали в кнопку «+ Что посетить»
                над вкладками — здесь остался только тот способ, которого
                там нет: прикрепить готовый список. */}
            {canContribute && (
              <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                <AttachListSelect tripId={trip.id} availableLists={availableLists} />
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

            {/* «Маршрут дня» (аудит 2026-09, §7): чистая ссылка Google
                Maps со waypoints, без API-ключей. Точки — места вкладки
                с координатами, порядок — жадный по близости от первой
                (см. src/lib/dayRoute.ts). Origin не задан — маршрут
                начнётся с текущего положения человека. */}
            {(() => {
              const route = buildDayRoute(pins);
              return (
                route && (
                  <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                    <a
                      href={route.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-ghost btn-sm"
                    >
                      🗺️ {t.trips.places.routeButton}
                    </a>
                    {/* Больше девяти точек Google в ссылку не берёт —
                        говорим об этом честно, а не молча режем. */}
                    {route.total > route.shown && (
                      <span className="small text-secondary">
                        {t.trips.places.routeCapped(route.shown, route.total)}
                      </span>
                    )}
                  </div>
                )
              );
            })()}

            {/* Карта — ПОД списками (правка владельца 2026-09-07):
                сначала читают, куда собрались, и только потом смотрят,
                как это разбросано по городу. */}
            {pins.length > 0 && (
              <div className="mb-4">
                <LocationMapLoader locations={pins} height="22rem" />
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
