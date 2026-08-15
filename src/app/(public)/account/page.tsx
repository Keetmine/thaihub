import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { getFriendIds } from "@/lib/friends";
import AccountTabs, { type AccountTab, type AccountEventEntry } from "./AccountTabs";
import { isPremiumActive } from "@/lib/premium";

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
        include: { event: eventWithOccurrences },
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

  // В кабинете многодневное событие — ОДНА строка со всеми датами
  // («16, 17, 18 октября»), а не строка на дату: разбивка по датам
  // нужна только там, где список сортируется по датам (афиша, календарь).
  type EventWithOcc = (typeof attendances)[number]["event"];
  const toEntry = (event: EventWithOcc): AccountEventEntry => ({
    id: event.id,
    title: event.title,
    venue: event.venue,
    occurrences: event.occurrences.map((o) => ({ startsAt: o.startsAt, endsAt: o.endsAt })),
  });
  const lastDate = (e: AccountEventEntry) => e.occurrences[e.occurrences.length - 1]?.startsAt ?? now;
  const firstDate = (e: AccountEventEntry) => e.occurrences[0]?.startsAt ?? now;

  const attendanceEntries = attendances.map((a) => toEntry(a.event));
  // «Предстоящее», пока не прошла последняя дата события.
  const upcomingAttendances = attendanceEntries
    .filter((e) => lastDate(e) >= now)
    .sort((a, b) => firstDate(a).getTime() - firstDate(b).getTime());
  const pastAttendances = attendanceEntries
    .filter((e) => lastDate(e) < now)
    .sort((a, b) => firstDate(b).getTime() - firstDate(a).getTime());
  const favoriteEvents = favoriteEventRows
    .map((f) => toEntry(f.event))
    .sort((a, b) => firstDate(a).getTime() - firstDate(b).getTime());

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
          going: attendances.length,
          favoriteEvents: favoriteEventRows.length,
          favoritePerformers: favoritePerformersCount,
          dramas: watchCount,
          friends: friendIds.length,
          trips: tripsCount,
        }}
        upcomingAttendances={isPremiumActive(user) ? upcomingAttendances : []}
        pastAttendances={isPremiumActive(user) ? pastAttendances : []}
        favoriteEvents={isPremiumActive(user) ? favoriteEvents : []}
        eventsLocked={!isPremiumActive(user)}
      />
    </div>
  );
}
