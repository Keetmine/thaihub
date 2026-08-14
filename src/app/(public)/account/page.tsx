import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { flattenOccurrence } from "@/lib/eventOccurrences";
import AccountTabs, { type AccountTab } from "./AccountTabs";

export const dynamic = "force-dynamic";

const VALID_TABS: AccountTab[] = ["profile", "events", "performers", "dramas"];

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

  const [
    attendances,
    favoritePerformers,
    favoriteEventRows,
    dramaWatchStatuses,
  ] = await Promise.all([
    prisma.eventAttendance.findMany({
      where: { userId: user.id },
      include: { event: eventWithOccurrences },
    }),
    prisma.favoritePerformer.findMany({
      where: { userId: user.id },
      include: { performer: true },
    }),
    prisma.favoriteEvent.findMany({
      where: { userId: user.id },
      include: { event: eventWithOccurrences },
    }),
    prisma.dramaWatchStatus.findMany({
      where: { userId: user.id },
      include: { drama: true },
    }),
  ]);

  const now = new Date();
  const attendanceEvents = attendances.flatMap((a) =>
    a.event.occurrences.map((occ) => flattenOccurrence({ ...occ, event: a.event })),
  );
  const upcomingAttendances = attendanceEvents
    .filter((ev) => ev.startsAt >= now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const pastAttendances = attendanceEvents
    .filter((ev) => ev.startsAt < now)
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  const favoriteEvents = favoriteEventRows
    .flatMap((f) => f.event.occurrences.map((occ) => flattenOccurrence({ ...occ, event: f.event })))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  return (
    <div>
      <span className="eyebrow">Аккаунт</span>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2.5rem" }}>
        {user.name || user.email}
      </h1>

      <AccountTabs
        initialTab={initialTab}
        user={{ name: user.name, email: user.email }}
        upcomingAttendances={upcomingAttendances}
        pastAttendances={pastAttendances}
        favoritePerformers={favoritePerformers}
        favoriteEvents={favoriteEvents}
        dramaWatchStatuses={dramaWatchStatuses}
      />
    </div>
  );
}
