import ReviewsAndComments from "@/components/ReviewsAndComments";
import { translatedText } from "@/lib/entityTranslations";
import SourcesBlock from "@/components/SourcesBlock";
import AppLink from "@/components/AppLink";
import BackLink from "@/components/BackLink";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { dateKey, formatCombinedDateList, formatHumanDate, formatTime, formatTimeRangeWithZone, formatTimeWithZone } from "@/lib/dates";
import { getT, localeHref } from "@/lib/i18n";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import type { EventOccurrence } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/userAuth";
import { canSeeMeetup } from "@/lib/meetups";
import { getFriendIds } from "@/lib/friends";
import FavoriteButton from "@/components/FavoriteButton";
import EntityMiniCard from "@/components/EntityMiniCard";
import EventDayLineup, { type LineupDay } from "@/components/EventDayLineup";
import CastGrid from "@/components/CastGrid";
import { BuildingIcon, CalendarIcon, ClockIcon, InfoIcon, PinIcon, TagIcon, TicketIcon, TvIcon, UsersIcon } from "@/components/icons";
import { performerHref } from "@/lib/performerSlug";
import {
  fetchPairingsAmong,
  groupLineupByStage,
  hideMembersOfListedBands,
  keepPairingsTogether,
} from "@/lib/castLineup";
import { dramaHref } from "@/lib/dramaSlug";
import { dramaTitleForLocale } from "@/lib/dramaLocale";
import { communityHref, slugOrIdWhere } from "@/lib/slugHelpers";
import { getCommunityPeersGoing, type CommunityPeerGoing } from "@/lib/favorites";
import { userDisplayName, userHref } from "@/lib/userProfile";
import PremiumUpsell from "@/components/PremiumUpsell";
import MeetupPoster from "@/app/(public)/communities/[id]/MeetupPoster";
import EventNoteSection, { type FriendNote } from "./EventNoteSection";
import SiteGoersBlock, { type SiteGoer } from "./SiteGoersBlock";
import EventPhotoGallery from "./EventPhotoGallery";
import GoingDateChips from "./GoingDateChips";
import SeenToggle from "@/components/SeenToggle";
import { eventSeenState, type SeenEntry } from "@/lib/seenLive";
import { toggleEventSeen, setDaySeen } from "@/app/(public)/artists/seenActions";
import TicketSection, { type TicketRow } from "./TicketSection";
import { getCoTravelerIds } from "@/lib/coTravelers";
import { isPremiumActive } from "@/lib/premium";
import { pageMetadata, eventJsonLd, JsonLd } from "@/lib/seo";
import { cache } from "react";

// React.cache: generateMetadata и страница делят ОДИН запрос на
// HTTP-запрос (как getCurrentUser в lib/userAuth.ts) — раньше метадата
// ходила в базу отдельным узким select.
const getEvent = cache(async (rawId: string) =>
  prisma.event.findFirst({
    where: slugOrIdWhere(rawId),
    include: {
      performers: {
        include: {
          performer: {
            include: {
              // Состав группы — чтобы убрать из списка её участников,
              // если группа на событии стоит сама (АА14). Раньше здесь
              // было наоборот: группа разворачивалась в участников.
              bandMembers: { select: { performerId: true } },
              // _count.events — маркер популярности для сортировки
              // каст-сетки (Э2ф).
              _count: { select: { events: true } },
            },
          },
        },
      },
      drama: true,
      // Встреча сообщества (АА25): по ней страница решает, кого сюда
      // пускать и что писать в шапке. У афишного события тут null.
      community: { select: { id: true, slug: true, title: true } },
      photos: { orderBy: { sort: "asc" } },
      occurrences: {
        orderBy: { startsAt: "asc" },
        include: {
          lineup: {
            include: {
              performer: {
                select: {
                  id: true,
                  slug: true,
                  name: true,
                  photoUrl: true,
                  // Те же два правила, что и у общего состава (АА14/АА4).
                  bandMembers: { select: { performerId: true } },
                },
              },
            },
          },
        },
      },
    },
  }),
);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { locale, t } = await getT();
  const { id } = await params;
  const event = await getEvent(id);
  // notFound() именно здесь: метадата считается до флаша ответа, и
  // несуществующий slug получает настоящий HTTP 404 — иначе loading.tsx
  // успевал отдать 200-shell до notFound() в самой странице (soft-404).
  if (!event) notFound();
  const date = event.occurrences[0]?.startsAt;
  const when = date ? formatHumanDate(date, locale) : null;
  // Закрытая встреча сообщества и в метадате отвечает 404: постороннему
  // нельзя показывать даже заголовок («Смотрим 5 серию у Кати» в
  // <title> — уже утечка), а участнику её всё равно не индексируют.
  if (event.communityId) {
    // isSiteAdmin — чтобы админ сайта дошёл до встречи из очереди жалоб
    // (аудит 2026-09, п.1.9): смотреть можно, участником не становится.
    const metaViewer = await getCurrentUser();
    if (!(await canSeeMeetup(event, metaViewer?.id, { isSiteAdmin: !!metaViewer?.isAdmin }))) {
      notFound();
    }
    // Участнику страницу отдаём, поисковику — никогда: встречу видят
    // только свои, и в индексе ей делать нечего.
    return pageMetadata({
      title: translatedText(event, "title", event.title, locale),
      description: t.communities.meetups.eventNoticeMembers,
      noIndex: true,
    });
  }
  return pageMetadata({
    title: translatedText(event, "title", event.title, locale),
    description:
      translatedText(event, "description", event.description, locale)?.slice(0, 160) ??
      t.events.detail.metaDescription(
        translatedText(event, "title", event.title, locale),
        when,
        translatedText(event, "venue", event.venue, locale),
      ),
    path: `/event/${event.slug ?? id}`,
    image: event.posterUrl,
    type: "article",
    // noIndex здесь БОЛЬШЕ НЕТ: карточка события (что, когда, где, кто)
    // открыта всем, robots.txt её тоже пускает — противоречия
    // «robots запрещает, а мета разрешает» быть не должно. За подпиской
    // остались только личные блоки страницы, в разметку они не идут.
  });
}


export const dynamic = "force-dynamic";

/** Groups occurrences that share the same start/end time-of-day (e.g. a
 *  run of shows all at "18:00–20:00" on consecutive dates) so they render
 *  as one combined date line instead of one full date per occurrence —
 *  occurrences with a distinct time of their own stay in their own
 *  single-item group and keep the full weekday date format. */
function groupOccurrencesByTime(occurrences: EventOccurrence[]): EventOccurrence[][] {
  const groups = new Map<string, EventOccurrence[]>();
  for (const occ of occurrences) {
    const timeOfDay = (d: Date) => `${d.getHours()}:${d.getMinutes()}`;
    const key = `${timeOfDay(occ.startsAt)}-${occ.endsAt ? timeOfDay(occ.endsAt) : ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(occ);
  }
  return Array.from(groups.values());
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { locale, t } = await getT();
  const { id: rawId } = await params;
  // Тот же React.cache-запрос, что и в generateMetadata, — Prisma
  // дёргается один раз на HTTP-запрос.
  const event = await getEvent(rawId);

  if (!event) notFound();
  // Русские тексты записи: перевод, если он есть, иначе оригинал.
  const eventTitle = translatedText(event, "title", event.title, locale);
  const eventVenue = translatedText(event, "venue", event.venue, locale);
  const eventDescription = translatedText(event, "description", event.description, locale);

  // --- own block: current user's favorite/attendance state for this event ---
  // АА4: пары среди тех, кто на событии (общий состав + лайнапы дней) —
  // одним запросом на страницу, чтобы поставить их рядом в списках.
  const [currentUser, castPairings, allAttendances] = await Promise.all([
    getCurrentUser(),
    fetchPairingsAmong([
      ...new Set([
        ...event.performers.map((ep) => ep.performer.id),
        ...event.occurrences.flatMap((o) => o.lineup.map((l) => l.performer.id)),
      ]),
    ]),
    // ЕДИНСТВЕННАЯ выборка EventAttendance на страницу: из неё же
    // достаются и свои отметки зрителя, и «Друзья идут», и новый ряд
    // «Идут с сайта» (аудит 2026-09, п.7) — раньше своих и дружеских
    // отметок было два отдельных запроса, теперь их ноль сверх этого.
    // Удалённые аккаунты отсекаем сразу: они не показываются нигде.
    prisma.eventAttendance.findMany({
      where: { eventId: event.id, user: { deletedAt: null } },
      // По времени отметки: ряд «Идут с сайта» стабилен между
      // заходами, а не перетасовывается базой.
      orderBy: { createdAt: "asc" },
      select: {
        occurrenceId: true,
        userId: true,
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            photoUrl: true,
            hideProfileActivity: true,
          },
        },
      },
    }),
  ]);
  const viewerTz = currentUser?.timezone ?? DEFAULT_TIMEZONE;


  // Встреча сообщества (АА25). Закрытая — только участникам и админу
  // сайта (модерация; аудит 2026-09, п.1.9): посторонний получает
  // честный 404, как будто страницы нет (см. lib/meetups.ts).
  // Метадата выше проверяет то же самое и тем же способом.
  const isMeetup = !!event.communityId;
  if (
    isMeetup &&
    !(await canSeeMeetup(event, currentUser?.id, { isSiteAdmin: !!currentUser?.isAdmin }))
  ) {
    notFound();
  }

  // Карточка события ПУБЛИЧНАЯ: что, когда, где, кто выступает, постер,
  // описание, цена и ссылка на билеты — видно всем, включая поисковики
  // (эти же поля уходят в Event-разметку ниже). За подпиской остались
  // только личные планы вокруг события: отметки «иду», свои билеты,
  // заметки, «друзья идут», напоминание о препродаже и выгрузка в
  // календарь (маршрут /ics и сам отвечает 403 без подписки).
  const isPremium = isPremiumActive(currentUser);
  let isEventFavorited = false;
  let goingOccurrenceIds: string[] = [];
  /** Свои «возможно пойду» по датам этого события — кандидаты, а не план. */
  let maybeOccurrenceIds: string[] = [];
  let friendsGoing: { id: string; name: string | null; photoUrl: string | null }[] = [];
  let ownNote: { text: string; visibility: string } | null = null;
  let friendNotes: FriendNote[] = [];
  let ticketRows: TicketRow[] = [];
  // Кого зритель видел на ЭТОМ событии (правка владельца 2026-09-15).
  // Пусто — глазиков нет вовсе: не залогинен или не был ни на одной
  // прошедшей дате.
  let seenState = new Map<string, SeenEntry>();
  // Избранное — бесплатное: сердечко работает у любого залогиненного,
  // подписка на него не влияет (как на страницах артистов и сериалов).
  if (currentUser && !isPremium) {
    isEventFavorited = !!(await prisma.favoriteEvent.findUnique({
      where: { userId_eventId: { userId: currentUser.id, eventId: event.id } },
    }));
    // «Иду» на встрече сообщества — БЕСПЛАТНО: участие в сообществах не
    // за подпиской (решение владельца 2026-09-08), а отметка здесь и
    // есть весь смысл встречи — по ней видно, сколько народу придёт.
    // Свои отметки — из общей выборки выше, отдельный запрос не нужен.
    if (isMeetup) {
      goingOccurrenceIds = allAttendances
        .filter((a) => a.userId === currentUser.id)
        .map((a) => a.occurrenceId);
    }
  }
  if (currentUser && isPremium) {
    // Первая волна: всё, что зависит только от юзера и события, — включая
    // билеты, раньше ждавшие отдельным await. Свои отметки «иду» —
    // из общей выборки allAttendances, отдельного запроса больше нет.
    const attendances = allAttendances.filter((a) => a.userId === currentUser.id);
    const [favorite, friendIds, coTravelerIds, myTickets] =
      await Promise.all([
        prisma.favoriteEvent.findUnique({
          where: { userId_eventId: { userId: currentUser.id, eventId: event.id } },
        }),
        getFriendIds(currentUser.id),
        getCoTravelerIds(currentUser.id),
        // «Мои билеты»: строка на каждую дату с отметкой «иду». Сами билеты
        // — из EventTicket: они живут отдельно от отметок и переживают их.
        prisma.eventTicket.findMany({
          where: { userId: currentUser.id, eventId: event.id },
          select: {
            occurrenceId: true,
            fileUrl: true,
            onlineBookingAt: true,
            onlineBookingUrl: true,
          },
        }),
      ]);
    isEventFavorited = !!favorite;
    goingOccurrenceIds = attendances.map((a) => a.occurrenceId);
    const ticketByOccurrence = new Map(
      myTickets.filter((t) => t.occurrenceId).map((t) => [t.occurrenceId!, t]),
    );
    ticketRows = attendances
      .map((a) => {
        const occ = event.occurrences.find((o) => o.id === a.occurrenceId);
        if (!occ) return null;
        const ticket = ticketByOccurrence.get(a.occurrenceId);
        // Онлайн-бронирование: подпись собираем здесь, как у препродажи
        // (дата + тайское время + время зрителя в скобках), а сырые
        // дата/время отдаём для формы редактирования.
        const bookingAt = ticket?.onlineBookingAt ?? null;
        const onlineBooking =
          ticket && (bookingAt || ticket.onlineBookingUrl)
            ? {
                date: bookingAt ? dateKey(bookingAt) : "",
                time: bookingAt ? formatTime(bookingAt) : "",
                url: ticket.onlineBookingUrl ?? "",
                label: bookingAt
                  ? `${formatHumanDate(bookingAt, locale)} · ${formatTimeWithZone(bookingAt, viewerTz, locale)}`
                  : null,
              }
            : null;
        return {
          occurrenceId: a.occurrenceId,
          dateLabel: formatHumanDate(occ.startsAt, locale),
          ticketUrl: ticket?.fileUrl ?? null,
          onlineBooking,
        };
      })
      .filter((r): r is TicketRow => r !== null);

    // Вторая волна: заметки ждут только списков друзей/попутчиков из
    // первой. «Друзья идут» больше в базу не ходят — фильтруются из
    // общей выборки allAttendances.
    // Заметки (Г6): своя + друзей с видимостью FRIENDS + со-путешественников
    // по совместным поездкам с видимостью TRIP.
    const notes = await prisma.eventNote.findMany({
      where: {
        eventId: event.id,
        OR: [
          { userId: currentUser.id },
          ...(friendIds.length > 0
            ? [{ userId: { in: friendIds }, visibility: "FRIENDS" as const }]
            : []),
          ...(coTravelerIds.length > 0
            ? [{ userId: { in: coTravelerIds }, visibility: "TRIP" as const }]
            : []),
        ],
      },
      include: { user: { select: { name: true, photoUrl: true } } },
    });
    // «Иду» per-дата — у идущего на все 3 дня будет 3 строки; в блоке
    // «Друзья идут» человек выводится один раз. hideProfileActivity
    // друзей тут НЕ смотрим — друзья видят активность друг друга, как в
    // профиле (`showActivity` в users/[id]/page.tsx).
    const friendIdSet = new Set(friendIds);
    friendsGoing = Array.from(
      new Map(
        allAttendances
          .filter((a) => friendIdSet.has(a.userId))
          .map((a) => [a.user.id, a.user]),
      ).values(),
    );
    const own = notes.find((n) => n.userId === currentUser.id);
    ownNote = own ? { text: own.text, visibility: own.visibility } : null;
    friendNotes = notes
      .filter((n) => n.userId !== currentUser.id)
      .map((n) => ({ id: n.id, text: n.text, userName: n.user.name, userPhotoUrl: n.user.photoUrl }));
  }

  // «Кто из вашего сообщества идёт» (АА25) — вне премиум-ветки нарочно:
  // участие в сообществах бесплатно (решение владельца 2026-09-08), и
  // блок, ради которого человек в сообщество и вступал, не может
  // прятаться за подпиской. Гость сюда не доходит вовсе, посторонний
  // (не состоящий ни в одном сообществе) получит пустой список — блока
  // у него не будет.
  //
  // Только у каталожного события: на странице встречи сообщества «из
  // вашего сообщества» — это вообще все, кто там отметился, и блок
  // повторял бы счётчик «идут: N» соседней строкой.
  //
  // Друзей передаём в исключения: они уже показаны блоком выше, и одно
  // лицо на странице дважды выглядит ошибкой, а не заботой.
  let communityPeersGoing: CommunityPeerGoing[] = [];
  if (currentUser && !isMeetup) {
    communityPeersGoing = await getCommunityPeersGoing(
      event.id,
      currentUser.id,
      friendsGoing.map((f) => f.id),
    );
  }

  // «Идут с сайта» (аудит 2026-09, п.7): все люди сайта с отметкой «иду»
  // на любую из дат — витрина «тут есть люди», видная и гостю. Отдельного
  // запроса нет: ряд собирается из той же выборки allAttendances, что и
  // свои отметки с «Друзья идут» выше.
  //
  // Правила ряда:
  // - закрывшие профиль (hideProfileActivity) не показываются — тот же
  //   мастер-выключатель, что в профиле (`showActivity` в
  //   users/[id]/page.tsx) и в «Из вашего сообщества идут»;
  // - сам зритель видит себя ВСЕГДА, даже закрывшись, — как свою
  //   активность в собственном профиле; поэтому он и стоит первым;
  // - друзья и соседи по сообществу, уже показанные плашками выше, в ряд
  //   не дублируются: одно лицо на странице дважды выглядит ошибкой, а
  //   не заботой (то же правило, что между блоками друзей и сообщества);
  // - удалённые аккаунты отсечены ещё в выборке.
  //
  // На встрече сообщества ряд тоже есть: гостей туда не пускает сама
  // страница (canSeeMeetup), а участникам видно, кто собирается.
  const shownAbove = new Set([
    ...friendsGoing.map((f) => f.id),
    ...communityPeersGoing.map((p) => p.id),
  ]);
  const siteGoers: SiteGoer[] = Array.from(
    new Map(
      allAttendances
        .filter(
          ({ user }) =>
            user.id === currentUser?.id ||
            (!user.hideProfileActivity && !shownAbove.has(user.id)),
        )
        .map(({ user }) => [user.id, user]),
    ).values(),
  ).sort((a, b) => Number(b.id === currentUser?.id) - Number(a.id === currentUser?.id));
  if (currentUser) {
    const [seen, maybes] = await Promise.all([
      eventSeenState(currentUser.id, event.id),
      prisma.eventMaybe.findMany({
        where: { userId: currentUser.id, eventId: event.id },
        select: { occurrenceId: true },
      }),
    ]);
    seenState = seen;
    maybeOccurrenceIds = maybes.map((m) => m.occurrenceId);
  }
  // --- end own block ---

  // Э2ф: свой осмысленный порядок у состава события не хранится —
  // сортируем по популярности (числу событий у артиста), при равенстве
  // по имени; первые ~14 видимых в сетке — самые популярные.
  //
  // Поверх сортировки — два общих правила списка исполнителей (см.
  // src/lib/castLineup.ts):
  //   АА14 — участники группы, которая и сама привязана к событию, из
  //     списка убираются: группа их уже представляет. Раньше было ровно
  //     наоборот — страница ДОРИСОВЫВАЛА участников группы подписью с её
  //     названием; владелец попросил обратного. Связи в базе не
  //     трогаются: на странице участника событие остаётся.
  //   АА4 — пары стоят рядом, а не разъезжаются по популярности, и
  //     идут ПЕРВЫМИ (`pairsFirst`, правка владельца 2026-09-15 — то же
  //     правило, что на странице сериала): состав открывается парами,
  //     ради которых на концерт и идут, а не самым «событийным»
  //     артистом второго плана.
  const castCards = keepPairingsTogether(
    hideMembersOfListedBands(
      [...event.performers].sort(
        (a, b) =>
          b.performer._count.events - a.performer._count.events ||
          a.performer.name.localeCompare(b.performer.name),
      ),
      (ep) => ep.performer.id,
      (ep) => ep.performer.bandMembers.map((bm) => bm.performerId),
    ),
    (ep) => ep.performer.id,
    castPairings,
    { pairsFirst: true },
  ).map(({ performer }) => ({
    id: performer.id,
    href: performerHref(performer),
    photoUrl: performer.photoUrl,
    name: performer.name,
    seen: seenState.get(performer.id)?.seen,
  }));
  // Состав ЛЮБОГО размера живёт плашками в инфо-блоке (просьба
  // владельца — как на сериалах): большой прячет хвост за «показать
  // всех» через CastGrid chips, отдельной секции больше нет.
  //
  // Но если у фестиваля есть расписание по дням, общий состав не
  // показываем вовсе (правка владельца 2026-09-06): расписание и есть
  // состав, только со временем и сценами, — а список тех же людей выше
  // был бы их повтором без единой новой строчки.
  const dayLineups = event.occurrences.filter((o) => o.lineup.length > 0);
  const hasDayLineups = dayLineups.length > 0;
  const castInCard = castCards.length > 0 && !hasDayLineups;
  // …но «расписание и есть состав» верно, только пока расписание
  // покрывает весь состав. На Monster Music Festival 2026 пятеро
  // заявленных не попали ни в один день, и страница их не показывала
  // вовсе — «она заявлена на этом евенте, но я её не могу найти»
  // (жалоба владельца 2026-09-19). Таких показываем отдельным блоком
  // под расписанием.
  const lineupPerformerIds = new Set(
    dayLineups.flatMap((o) => o.lineup.map((l) => l.performer.id)),
  );
  const castWithoutDay = hasDayLineups
    ? castCards.filter((c) => !lineupPerformerIds.has(c.id))
    : [];

  // Расписание к виду страницы: день → сцены → выступления по времени.
  // Свои отметки «иду» — из общей выборки, а НЕ из goingOccurrenceIds:
  // тот список наполняется только под подпиской (кнопки «иду» платные),
  // а отмечать увиденных на уже посещённом дне вправе и тот, у кого
  // подписка кончилась, — это его собственная история.
  const ownOccurrenceIds = new Set(
    currentUser ? allAttendances.filter((a) => a.userId === currentUser.id).map((a) => a.occurrenceId) : [],
  );
  const lineupDays: LineupDay[] = dayLineups.map((o) => {
    const rows = keepPairingsTogether(
      hideMembersOfListedBands(
        o.lineup,
        (l) => l.performer.id,
        (l) => l.performer.bandMembers.map((bm) => bm.performerId),
      ),
      (l) => l.performer.id,
      castPairings,
      { pairsFirst: true },
    );
    return {
      id: o.id,
      dateLabel: formatHumanDate(o.startsAt, locale),
      countLabel: t.events.detail.performances(rows.length),
      // Отмечать можно только свой ПРОШЕДШИЙ день: до события отмечать
      // нечего, на чужой — тем более.
      canMark: ownOccurrenceIds.has(o.id) && o.startsAt < new Date(),
      stages: groupLineupByStage(rows).map((group) => ({
        stage: group.stage,
        items: group.items.map((l) => ({
          id: l.performer.id,
          href: performerHref(l.performer),
          name: l.performer.name,
          photoUrl: l.performer.photoUrl,
          timeText: l.timeText,
          seen: seenState.get(l.performer.id)?.seen,
        })),
      })),
    };
  });

  // В разметке сериал зовётся так же, как на видимой странице: на /ru —
  // русским названием, если оно есть.
  const eventLd = eventJsonLd({
    ...event,
    drama: event.drama ? { ...event.drama, title: dramaTitleForLocale(event.drama, locale) } : null,
  });

  return (
    <div>
      <BackLink fallbackHref="/" fallbackLabel={t.events.detail.backToEvents} />
      {/* Классическая шапка (по просьбе владельца): заголовок сверху,
          постер слева с кнопкой «Билеты», инфо-карта справа. */}
      {/* Отдельной плашки над заголовком больше НЕТ (правка владельца
          2026-09-08 «некрасиво выводится»): сообщество уехало строкой в
          блок информации, к площадке и организатору. */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-2 mb-4">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.25rem" }}>
          {eventTitle}
        </h1>
        <div className="d-flex align-items-center gap-2 flex-shrink-0">
          <FavoriteButton kind="event" id={event.id} isFavorited={isEventFavorited} variant="icon" />
          {/* Выгрузка в календарь — по подписке: маршрут /ics отвечает
              403 без неё, кнопка-обманка была бы хуже её отсутствия. У
              встречи сообщества доступ решает участие, а не подписка —
              маршрут проверяет ровно это. */}
          {(isPremium || isMeetup) && (
            <a
              href={localeHref(`/event/${event.id}/ics`, locale)}
              className="round-icon-btn"
              aria-label={t.events.detail.addToCalendar}
              data-tooltip={t.events.detail.addToCalendar}
            >
              <CalendarIcon />
            </a>
          )}
        </div>
      </div>

      <div className="d-flex flex-column flex-sm-row gap-4 mb-3">
        {/* У ВСТРЕЧИ колонка постера есть всегда: с картинкой — картинка,
            без неё — фон с первой буквой названия (просьба владельца
            2026-09-08). У каталожного события заглушки нет намеренно:
            там пустой постер — это дырка в данных, которую заполнит
            админка, а не осознанный выбор автора. */}
        {(event.posterUrl || isMeetup) && (
          <div className="flex-shrink-0 d-flex flex-column gap-2" style={{ width: "15rem" }}>
            <MeetupPoster title={eventTitle} posterUrl={event.posterUrl} />
            {event.presaleUrl && (
              <a
                href={event.presaleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
              >
                <TicketIcon className="icon-inline" /> {t.events.detail.tickets}
              </a>
            )}
          </div>
        )}
        {/* Без подложки-surface (просьба владельца). */}
        <div className="flex-fill" style={{ minWidth: 0 }}>
            {/* Сообщество — ПЕРВОЙ строкой блока информации (правка
                владельца 2026-09-08): раньше это был отдельный абзац над
                заголовком, и он выбивался из страницы. Оформление — как у
                площадки и организатора: иконка, подпись, значение; значение
                — ссылка обратно в сообщество, ради которой строка и нужна.
                Оговорку «видят только участники» держим тихой добавкой: это
                пояснение к странице, а не факт о встрече наравне с местом. */}
            {event.community && (
              <p className="mb-2">
                <UsersIcon className="icon-inline" />{" "}
                <span className="text-secondary">{t.communities.meetups.eventCommunityLabel}</span>{" "}
                <AppLink href={communityHref(event.community)} className="link-body-emphasis">
                  {event.community.title}
                </AppLink>
                <span className="small text-secondary">
                  {` · ${t.communities.meetups.eventOnlyMembers}`}
                </span>
              </p>
            )}
            {/* Площадка: при наличии mapsUrl её название — ссылка на
                карту в новой вкладке (краулер фестивалей отдаёт короткие
                maps.app.goo.gl). Адрес — тихой строкой рядом, отдельной
                строки «Адрес: —» у пустого поля нет. */}
            {/* Онлайн-встреча сообщества: вместо площадки и карты —
                бейдж «Онлайн» (venue у неё хранится пустым, см.
                eventActions сообществ). Ключ — тот же card.online, что
                на карточке: слово одно на весь сайт. */}
            {event.isOnline ? (
              <p className="mb-2">
                <PinIcon className="icon-inline" />{" "}
                <span className="text-secondary">{t.events.detail.venue}</span>{" "}
                <span className="date-chip">{t.events.card.online}</span>
              </p>
            ) : (
            <p className="mb-2">
              <PinIcon className="icon-inline" />{" "}
              <span className="text-secondary">{t.events.detail.venue}</span>{" "}
              {event.mapsUrl ? (
                <a
                  href={event.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-body-emphasis"
                  title={t.events.detail.openOnMap}
                >
                  {eventVenue}
                </a>
              ) : (
                eventVenue
              )}
              {event.address && (
                <span className="text-secondary"> · {event.address}</span>
              )}
            </p>
            )}
            {event.organizer && (
              <p className="mb-2">
                <BuildingIcon className="icon-inline" />{" "}
                <span className="text-secondary">{t.events.detail.organizer}</span>{" "}
                {event.organizer}
              </p>
            )}
            {/* Теги — сразу под организатором (правка владельца
                2026-09-06) и кликабельные: чип ведёт в поиск по событиям
                с этим тегом, как жанр у сериала. */}
            {event.tags.length > 0 && (
              <p className="small text-secondary mb-2 d-flex flex-wrap align-items-center gap-2">
                <span className="d-inline-flex align-items-center gap-1">
                  <TagIcon /> <span className="text-secondary">{t.events.detail.tags}</span>
                </span>
                {event.tags.map((tag) => (
                  <AppLink
                    key={tag}
                    href={`/search?section=events&tags=${encodeURIComponent(tag)}`}
                    className="tag-chip text-decoration-none"
                  >
                    {tag}
                  </AppLink>
                ))}
              </p>
            )}
            {groupOccurrencesByTime(event.occurrences).map((group) => {
              const first = group[0];
              return (
                <p key={group.map((o) => o.id).join("-")} className="mb-2">
                  <CalendarIcon />{" "}
                  <span className="text-secondary">{t.events.detail.dateAndTime}</span>{" "}
                  {group.length === 1 ? (
                    <span className="text-capitalize">
                      {formatHumanDate(first.startsAt, locale)}
                    </span>
                  ) : (
                    formatCombinedDateList(
                      group.map((o) => o.startsAt),
                      locale,
                    )
                  )}
                  {/* Зона события: у встречи сообщества — своя, и
                      «18:10 Минск» вместо «22:10 (МСК 18:10)». */}
                  {first.hasTime && <> · {formatTimeRangeWithZone(first.startsAt, first.endsAt, viewerTz, locale, event.timezone)}</>}
                </p>
              );
            })}
            {currentUser && (isPremium || isMeetup) && (
              <div className="mb-2">
                <GoingDateChips
                  occurrences={event.occurrences.map((o) => ({ id: o.id, startsAt: o.startsAt }))}
                  goingIds={goingOccurrenceIds}
                  maybeIds={maybeOccurrenceIds}
                />
              </div>
            )}
            {event.ticketPrice && (
              <p className="mb-0">
                <TicketIcon className="icon-inline" />{" "}
                <span className="text-secondary">{t.events.detail.ticketPrice}</span>{" "}
                {event.ticketPrice}
              </p>
            )}
            {(event.presaleAt || event.presaleUrl) && (
              <div className={event.drama ? "mt-3 mb-2" : "mt-3 mb-0"}>
                <p className="mb-2">
                  <ClockIcon className="icon-inline" />{" "}
                  <span className="text-secondary">{t.events.detail.presale}</span>{" "}
                  {event.presaleAt ? (
                    <>
                      <span className="text-capitalize">
                        {formatHumanDate(event.presaleAt, locale)}
                      </span>{" "}
                      · {formatTimeWithZone(event.presaleAt, viewerTz, locale)}
                    </>
                  ) : (
                    t.events.detail.presaleTba
                  )}
                </p>
                <div className="d-flex flex-wrap gap-2">
                  {/* Кнопка «Билеты» живёт под постером; здесь — только
                      напоминание, и лишь до старта препродажи. Само
                      напоминание — часть подписки (ics + телеграм). */}
                  {isPremium && event.presaleAt && event.presaleAt > new Date() && (
                    <a
                      href={localeHref(`/event/${event.id}/ics?presale=1`, locale)}
                      className="btn btn-ghost btn-sm d-inline-flex align-items-center gap-2"
                    >
                      <CalendarIcon className="icon-inline" />
                      {t.events.detail.addToCalendar}
                    </a>
                  )}
                </div>
              </div>
            )}
            {event.drama && (
              <p className="mb-0">
                <TvIcon className="icon-inline" />{" "}
                <span className="text-secondary">{t.events.detail.series}</span>{" "}
                <AppLink href={dramaHref(event.drama)} className="link-body-emphasis">
                  {dramaTitleForLocale(event.drama, locale)}
                </AppLink>
              </p>
            )}
            {castInCard && (
              <div className="mt-3">
                <p
                  className="small text-secondary text-uppercase mb-2"
                  style={{ letterSpacing: "0.08em" }}
                >
                  <UsersIcon className="icon-inline" /> {t.events.detail.lineup}
                </p>
                <CastGrid chips clampRows={2}>
                  {castCards.map((c) => (
                    // Глазик «видела здесь» — на самой капсуле, на углу
                    // фото (правка владельца 2026-09-17; до этого стоял
                    // соседом справа, а ещё раньше — только на странице
                    // артиста). Позиционирует .seen-toggle-chip.
                    <span key={c.id} className="cast-chip-seen">
                      <EntityMiniCard href={c.href} photoUrl={c.photoUrl} name={c.name} />
                      {c.seen !== undefined && (
                        <SeenToggle
                          eventId={event.id}
                          performerId={c.id}
                          initialSeen={c.seen}
                          toggle={toggleEventSeen}
                          size="chip"
                        />
                      )}
                    </span>
                  ))}
                </CastGrid>
              </div>
            )}
          </div>
      </div>

      {/* Расписание — сразу под карточкой события, НАД описанием
          (правка владельца 2026-09-06): у фестиваля это главное, ради
          чего страницу открывают. */}
      {hasDayLineups && (
        <div className="surface p-4 mb-4">
          <h2 className="section-heading mb-3">
            <CalendarIcon className="icon-inline" /> {t.events.detail.lineupByDay}
          </h2>
          <EventDayLineup
            days={lineupDays}
            eventId={event.id}
            toggleSeen={toggleEventSeen}
            setDaySeen={setDaySeen}
          />
          {castWithoutDay.length > 0 && (
            <div className="mt-4">
              <p
                className="small text-secondary text-uppercase mb-1"
                style={{ letterSpacing: "0.08em" }}
              >
                <UsersIcon className="icon-inline" /> {t.events.detail.castWithoutDay}
              </p>
              <p className="small text-secondary mb-2">{t.events.detail.castWithoutDayHint}</p>
              <CastGrid chips>
                {castWithoutDay.map((c) => (
                  <span key={c.id} className="cast-chip-seen">
                    <EntityMiniCard href={c.href} photoUrl={c.photoUrl} name={c.name} />
                    {c.seen !== undefined && (
                      <SeenToggle
                        eventId={event.id}
                        performerId={c.id}
                        initialSeen={c.seen}
                        toggle={toggleEventSeen}
                        size="chip"
                      />
                    )}
                  </span>
                ))}
              </CastGrid>
            </div>
          )}
        </div>
      )}

      {/* Описание — НАД тремя фото (правка владельца 2026-09-05); без
          подложки-surface (прежняя просьба). */}
      {eventDescription && (
        <div id="description" className="anchor-target mb-4">
          <h2 className="section-heading mb-2">
            <InfoIcon className="icon-inline" /> {t.events.detail.description}
          </h2>
          {/* pre-line: описания приходят с абзацами (и из формы, и из
              импорта по ссылке) — без него переносы схлопывались в
              сплошной текст (жалоба владельца). */}
          <p className="mb-0" style={{ whiteSpace: "pre-line" }}>{eventDescription}</p>
        </div>
      )}

      {/* Ж9: до трёх фото для покупающих билеты (схема зала, цены,
          бенефиты) одним рядом над «Моими билетами» — без заголовков и
          подписей, клик поднимает фото попапом (правки владельца). */}
      <EventPhotoGallery photos={event.photos.map((p) => ({ id: p.id, url: p.url }))} />

      {/* Э2ф: билеты — сразу под датами, состав — фото-сеткой ниже,
          описание и отзывы в конце.

          На встрече сообщества блока «Мои билеты» нет вовсе (просьба
          владельца 2026-09-08): это посиделки у кого-то дома, а не
          концерт — билета туда не существует, и прикреплять к отметке
          «иду» нечего. Пустая секция звала бы человека искать то, чего
          нет. */}
      {!isMeetup && <TicketSection rows={ticketRows} />}

      {/* Без подписки на месте личных блоков (иду / мои билеты / друзья
          / заметки / напоминание о препродаже) — объяснение, что они
          дают. Сама карточка события выше при этом открыта целиком. */}
      {!isPremium && !isMeetup && (
        <div className="mb-4">
          <PremiumUpsell
            feature={t.events.detail.paywallFeature}
            intro={t.events.detail.premiumIntro}
          />
        </div>
      )}

      {friendsGoing.length > 0 && (
        <div className="surface p-4 mb-3">
          <h2
            className="section-heading mb-2 d-flex align-items-center gap-2"
          >
            <UsersIcon />{" "}
            {/* Все даты прошли — прошедшее время (правка владельца
                2026-09-17): «идёт» о вчерашнем концерте читалось как
                ошибка. */}
            {event.occurrences.every((o) => o.startsAt < new Date())
              ? friendsGoing.length === 1
                ? t.events.detail.friendWent
                : t.events.detail.friendsWent
              : friendsGoing.length === 1
                ? t.events.detail.friendGoing
                : t.events.detail.friendsGoing}
          </h2>
          <div className="d-flex flex-wrap gap-2">
            {friendsGoing.map((f) => (
              <EntityMiniCard
                key={f.id}
                href="/friends"
                photoUrl={f.photoUrl}
                name={f.name || t.events.detail.unnamedFriend}
              />
            ))}
          </div>
        </div>
      )}

      {/* «Из вашего сообщества идут» (АА25) — той же плашкой и в том же
          месте, что и друзья: вопрос у человека один («кто из своих там
          будет»), и два разных вида ответа читались бы как две разные
          фичи. Подпись под именем — сообщество, через которое зритель с
          человеком и знаком. */}
      {communityPeersGoing.length > 0 && (
        <div className="surface p-4 mb-3">
          <h2 className="section-heading mb-2 d-flex align-items-center gap-2">
            <UsersIcon />{" "}
            {communityPeersGoing.length === 1
              ? t.communities.together.goingOne
              : t.communities.together.going}
          </h2>
          <div className="d-flex flex-wrap gap-2">
            {communityPeersGoing.map((p) => (
              <EntityMiniCard
                key={p.id}
                href={userHref(p)}
                photoUrl={p.photoUrl}
                name={userDisplayName(p, locale)}
                subtitle={p.community?.title}
              />
            ))}
          </div>
        </div>
      )}

      {/* «Идут с сайта» — третьим в ряду «кто там будет»: сначала самые
          близкие (друзья), потом знакомые (сообщества), потом остальные
          люди сайта. Пустой ряд компонент не рисует сам. */}
      <SiteGoersBlock goers={siteGoers} />

      {/* Заметки — личный блок (свои + друзей/попутчиков), по подписке. */}
      {isPremium && (
        <EventNoteSection eventId={event.id} ownNote={ownNote} friendNotes={friendNotes} />
      )}

      <div id="reviews" className="anchor-target">
        <ReviewsAndComments kind="event" id={event.id} />
      </div>

      {/* Атрибуция — всегда самым нижним блоком страницы (просьба
          владельца). */}
      <SourcesBlock links={[{ url: event.sourceUrl }]} />

      {/* Event-разметка: только публичные поля страницы, и только когда
          у события есть хотя бы одна дата (без startDate разметка
          невалидна). Данные — из того же запроса, что и сама страница. */}
      {/* Разметку Event закрытой встрече не отдаём вовсе: она собрана из
          названия, адреса и дат — то есть ровно из того, что не должно
          уехать в поиск (страница таким зрителям и не открывается, но
          правило держим в одном месте с noIndex выше). */}
      {/* У встречи разметки для поисковика нет вовсе: её и в индексе
          быть не должно. */}
      {eventLd && !isMeetup && <JsonLd data={eventLd} />}
    </div>
  );
}
