import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
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

  const [
    attendances,
    favoritePerformers,
    favoriteDramas,
    favoriteEvents,
    dramaWatchStatuses,
  ] = await Promise.all([
    prisma.eventAttendance.findMany({
      where: { userId: user.id },
      include: { event: true },
      orderBy: { event: { startsAt: "asc" } },
    }),
    prisma.favoritePerformer.findMany({
      where: { userId: user.id },
      include: { performer: true },
    }),
    prisma.favoriteDrama.findMany({
      where: { userId: user.id },
      include: { drama: true },
    }),
    prisma.favoriteEvent.findMany({
      where: { userId: user.id },
      include: { event: true },
      orderBy: { event: { startsAt: "asc" } },
    }),
    prisma.dramaWatchStatus.findMany({
      where: { userId: user.id },
      include: { drama: true },
    }),
  ]);

  const now = new Date();
  const upcomingAttendances = attendances.filter((a) => a.event.startsAt >= now);
  const pastAttendances = attendances.filter((a) => a.event.startsAt < now);

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
        favoriteDramas={favoriteDramas}
        favoriteEvents={favoriteEvents}
        dramaWatchStatuses={dramaWatchStatuses}
      />
    </div>
  );
}
