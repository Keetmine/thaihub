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

export const metadata = pageMetadata({
  title: "Профиль",
  description: "Ваш профиль на MyBLHub.",
  path: "/account",
  noIndex: true,
});


export const dynamic = "force-dynamic";

// Вкладок всего две: профиль и события. Избранные актёры и сериалы из
// кабинета убраны — те же списки и так живут на /performers и /dramas
// (вид по умолчанию без поиска — именно избранное/со статусом).
const VALID_TABS: AccountTab[] = ["profile", "events"];

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
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

  const eventWithOccurrences = {
    include: {
      performers: { include: { performer: true } },
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
  // У EventAttendance составной ключ (userId + occurrenceId), своего id
  // нет — он и служит ключом строки.
  const ticketRows = await prisma.eventAttendance.findMany({
    where: { userId: user.id, ticketUrl: { not: null } },
    select: {
      occurrenceId: true,
      ticketUrl: true,
      event: { select: { id: true, slug: true, title: true, venue: true } },
      occurrence: { select: { startsAt: true } },
    },
  });
  const tickets = ticketRows
    .map((t) => ({
      id: t.occurrenceId,
      ticketUrl: t.ticketUrl!,
      event: t.event,
      startsAt: t.occurrence?.startsAt ?? null,
    }))
    .sort((a, b) => (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0));

  // Статистика и ачивки (Д1/Д2): считаются при открытии кабинета; новые
  // ачивки фиксируются и поздравляются ботом внутри syncAchievements.
  const fullStats = await computeUserStats(user.id);
  const achievements = await syncAchievements(user.id, fullStats);

  return (
    <div>
      <span className="eyebrow">Аккаунт</span>
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
          topPerformers: fullStats.topPerformers,
          visitedLocations: fullStats.visitedLocations,
          visitedLocationPins: fullStats.visitedLocationPins,
          completedDramas: fullStats.completedDramas,
          trips: fullStats.trips,
          daysInThailand: fullStats.daysInThailand,
          friends: fullStats.friends,
          eventsByYear: fullStats.eventsByYear,
        }}
        tickets={tickets}
        achievements={achievements.map((a) => ({
          key: a.key,
          emoji: a.emoji,
          title: a.title,
          description: a.description,
          unlocked: a.unlocked,
          value: a.value,
          target: a.target,
        }))}
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
