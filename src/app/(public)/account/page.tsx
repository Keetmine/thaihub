import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { getFriendIds } from "@/lib/friends";
import { computeUserStats } from "@/lib/userStats";
import { syncAchievements } from "@/lib/achievements";
import AccountTabs, { type AccountTab } from "./AccountTabs";
import { flattenOccurrence } from "@/lib/eventOccurrences";
import { getFavoritedEventIds, getGoingOccurrenceIds } from "@/lib/favorites";
import { isPremiumActive } from "@/lib/premium";
import { pageMetadata } from "@/lib/seo";
import { getT, localeHref } from "@/lib/i18n";
import { dramaHref, eventHref, novelHref } from "@/lib/slugHelpers";
import { dramaTitleForLocale } from "@/lib/dramaLocale";

export async function generateMetadata() {
  const { locale, t } = await getT();
  return pageMetadata({
    title: t.account.metaTitle,
    description: t.account.metaDescription,
    path: "/account",
    noIndex: true,
    locale,
  });
}


export const dynamic = "force-dynamic";

// Вкладки: профиль, события и отзывы (плюс «Билеты», когда они есть, —
// без своего ?tab=). Избранные актёры и сериалы из кабинета убраны — те
// же списки и так живут на /performers и /dramas (вид по умолчанию без
// поиска — именно избранное/со статусом).
const VALID_TABS: AccountTab[] = ["profile", "events", "reviews"];

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { locale, t } = await getT();
  const user = await getCurrentUser();
  if (!user) {
    redirect(localeHref("/login", locale));
  }

  const { tab } = await searchParams;
  const initialTab: AccountTab = VALID_TABS.includes(tab as AccountTab)
    ? (tab as AccountTab)
    : "profile";

  // Списки актёров — выводятся в профиле рядом с «Чаще всего видела вживую».
  const artistLists = await prisma.performerList.findMany({
    where: { userId: user.id },
    include: {
      items: {
        include: { performer: { select: { id: true, slug: true, name: true, photoUrl: true } } },
        orderBy: { position: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Слим-выборка исполнителей: строкам EventAgendaRow нужны только
  // id/name/slug, полные строки Performer тянуть незачем.
  const eventWithOccurrences = {
    include: {
      performers: {
        include: { performer: { select: { id: true, name: true, slug: true } } },
      },
      occurrences: { orderBy: { startsAt: "asc" as const } },
    },
  };

  const [attendances, favoriteEventRows, favoritePerformersCount, watchCount, friendIds, tripsCount] =
    await Promise.all([
      prisma.eventAttendance.findMany({
        where: { userId: user.id },
        include: { event: eventWithOccurrences, occurrence: true },
      }),
      prisma.favoriteEvent.findMany({
        where: { userId: user.id },
        include: { event: eventWithOccurrences },
      }),
      prisma.favoritePerformer.count({ where: { userId: user.id } }),
      prisma.dramaWatchStatus.count({ where: { userId: user.id } }),
      getFriendIds(user.id),
      prisma.trip.count({ where: { userId: user.id } }),
    ]);

  const now = new Date();

  // Кабинет показывает события тем же EventAgendaRow, что афиша, поиск
  // и страницы артистов: строка на дату (постер, площадка, состав,
  // кнопки избранного/«иду») — единый компонент вместо своей вёрстки.
  // «Иду» — только отмеченные даты, избранное — все даты события.
  const attendanceRows = attendances
    .map((a) => flattenOccurrence({ ...a.occurrence, event: a.event }))
    .sort((x, y) => x.startsAt.getTime() - y.startsAt.getTime());
  const upcomingAttendances = attendanceRows.filter((e) => e.startsAt >= now);
  const pastAttendances = attendanceRows.filter((e) => e.startsAt < now).reverse();
  // Избранное — про событие целиком (FavoriteEvent по eventId), поэтому
  // многодневный концерт даёт ОДНУ строку (первая дата + «+N дат»), в
  // отличие от «иду», где отметки стоят на конкретные даты.
  const favoriteEvents = favoriteEventRows
    .filter((f) => f.event.occurrences.length > 0)
    .map((f) => ({
      row: flattenOccurrence({ ...f.event.occurrences[0], event: f.event }),
      extraDates: f.event.occurrences.length - 1,
    }))
    .sort((x, y) => x.row.startsAt.getTime() - y.row.startsAt.getTime());

  // Состояния кнопок в строках.
  const allRows = [...attendanceRows, ...favoriteEvents.map((f) => f.row)];
  const [favoritedEventIds, goingOccurrenceIds] = await Promise.all([
    getFavoritedEventIds(allRows.map((e) => e.id), user.id),
    getGoingOccurrenceIds(allRows.map((e) => e.occurrenceId), user.id),
  ]);

  // Билеты, загруженные к событиям: вкладка «Билеты» собирает их в одном
  // месте — иначе файл виден только на странице своего события.
  // EventTicket живёт отдельно от отметки «иду»: билет показывается и
  // после снятой отметки, и после пересборки дат события (occurrence
  // тогда отвязан, даты у строки нет — но билет цел).
  const ticketRows = await prisma.eventTicket.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      fileUrl: true,
      event: { select: { id: true, slug: true, title: true, venue: true } },
      occurrence: { select: { startsAt: true } },
    },
  });
  const tickets = ticketRows
    .map((t) => ({
      id: t.id,
      ticketUrl: t.fileUrl,
      event: t.event,
      startsAt: t.occurrence?.startsAt ?? null,
    }))
    .sort((a, b) => (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0));

  // Вкладка «Отзывы»: все отзывы пользователя по всем трём типам записей,
  // новые сверху. Ссылка/обложка считаются здесь (slugHelpers серверные),
  // клиентской вкладке уходит плоская строка. Свои приватные видны —
  // это же кабинет автора.
  const reviewRows = await prisma.review.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      rating: true,
      text: true,
      isPrivate: true,
      createdAt: true,
      drama: { select: { id: true, slug: true, title: true, titleRu: true, posterUrl: true } },
      novel: { select: { id: true, slug: true, title: true, coverUrl: true } },
      event: { select: { id: true, slug: true, title: true, posterUrl: true } },
    },
  });
  const myReviews = reviewRows.flatMap((r) => {
    const target = r.drama
      ? {
          href: dramaHref(r.drama),
          title: dramaTitleForLocale(r.drama, locale),
          imageUrl: r.drama.posterUrl,
        }
      : r.novel
        ? { href: novelHref(r.novel), title: r.novel.title, imageUrl: r.novel.coverUrl }
        : r.event
          ? { href: eventHref(r.event), title: r.event.title, imageUrl: r.event.posterUrl }
          : null;
    if (!target) return []; // осиротевший отзыв без записи — не показываем
    return [
      {
        id: r.id,
        rating: r.rating,
        text: r.text,
        isPrivate: r.isPrivate,
        createdAt: r.createdAt,
        ...target,
      },
    ];
  });

  // Статистика и ачивки (Д1/Д2): считаются при открытии кабинета; новые
  // ачивки фиксируются и поздравляются ботом внутри syncAchievements.
  // В кабинет уходят ТОЛЬКО полученные — неполученные остаются сюрпризом,
  // наружу передаётся лишь общий счётчик включённых ачивок.
  const fullStats = await computeUserStats(user.id);
  const achievements = await syncAchievements(user.id, fullStats);
  const unlockedAchievements = achievements.filter((a) => a.unlocked);

  return (
    <div>
      <span className="eyebrow">{t.account.eyebrow}</span>
      <h1 className="display-1-tight mt-3 mb-5" style={{ fontSize: "2.5rem" }}>
        {user.name || user.email}
      </h1>

      <AccountTabs
        initialTab={initialTab}
        user={{
          name: user.name,
          email: user.email,
          telegramUsername: user.telegramUsername,
          photoUrl: user.photoUrl,
          isPremium: isPremiumActive(user),
          createdAt: user.createdAt,
        }}
        stats={{
          going: new Set(attendances.map((a) => a.eventId)).size,
          favoriteEvents: favoriteEventRows.length,
          favoritePerformers: favoritePerformersCount,
          dramas: watchCount,
          friends: friendIds.length,
          trips: tripsCount,
        }}
        artistLists={artistLists.map((l) => ({
          id: l.id,
          slug: l.slug,
          title: l.title,
          items: l.items.map((i) => ({
            id: i.performer.id,
            slug: i.performer.slug,
            name: i.performer.name,
            photoUrl: i.performer.photoUrl,
          })),
        }))}
        statsData={{
          attendedEvents: fullStats.attendedEvents,
          upcomingEvents: fullStats.upcomingEvents,
          uniqueVenues: fullStats.uniqueVenues,
          performersSeenLive: fullStats.performersSeenLive,
          attendedEventsList: fullStats.attendedEventsList,
          seenPerformers: fullStats.seenPerformers,
          topPerformers: fullStats.topPerformers,
          visitedLocations: fullStats.visitedLocations,
          visitedLocationPins: fullStats.visitedLocationPins,
          completedDramas: fullStats.completedDramas,
          episodesWatched: fullStats.episodesWatched,
          hoursWatched: fullStats.hoursWatched,
          trips: fullStats.trips,
          daysInThailand: fullStats.daysInThailand,
          friends: fullStats.friends,
          eventsByYear: fullStats.eventsByYear,
        }}
        tickets={tickets}
        myReviews={myReviews}
        achievements={unlockedAchievements.map((a) => ({
          key: a.key,
          emoji: a.emoji,
          title: a.title,
          hint: a.hint,
          unlockedAt: a.unlockedAt,
        }))}
        achievementsTotal={achievements.length}
        upcomingAttendances={isPremiumActive(user) ? upcomingAttendances : []}
        pastAttendances={isPremiumActive(user) ? pastAttendances : []}
        favoriteEvents={isPremiumActive(user) ? favoriteEvents : []}
        favoritedEventIds={[...favoritedEventIds]}
        goingOccurrenceIds={[...goingOccurrenceIds]}
        eventsLocked={!isPremiumActive(user)}
      />
    </div>
  );
}
