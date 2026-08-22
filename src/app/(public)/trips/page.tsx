import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { endOfDay, formatShortDate } from "@/lib/dates";
import CreateTripButton from "./CreateTripButton";
import { TripInviteActions } from "./TripMembersControls";
import PremiumUpsell from "@/components/PremiumUpsell";
import { VISIBILITY_LABELS } from "@/lib/tripVisibility";
import { CalendarIcon } from "@/components/icons";
import { isPremiumActive } from "@/lib/premium";
import { getFriendIds } from "@/lib/friends";
import { tripHref } from "@/lib/slugHelpers";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Поездки",
  description: "Ваши поездки и совместные планы.",
  path: "/trips",
  noIndex: true,
});


export const dynamic = "force-dynamic";

export default async function TripsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Поездки целиком — платная функция (см. PremiumUpsell / /admin/users).
  if (!isPremiumActive(user)) {
    return (
      <div>
        <span className="eyebrow">Планирование</span>
        <h1 className="display-1-tight mt-3 mb-5" style={{ fontSize: "2.5rem" }}>
          Мои поездки
        </h1>
        <PremiumUpsell feature="Поездки" />
      </div>
    );
  }

  // Друзья — в мультиселект «С кем едете» формы создания.
  const friendIds = await getFriendIds(user.id);
  const friends = await prisma.user.findMany({
    where: { id: { in: friendIds } },
    select: { id: true, name: true, photoUrl: true },
    orderBy: { name: "asc" },
  });

  // Свои поездки + совместные, где я принял приглашение; отдельным
  // блоком — ещё не отвеченные приглашения.
  const [tripsRaw, invites] = await Promise.all([
    prisma.trip.findMany({
      where: {
        OR: [
          { userId: user.id },
          { members: { some: { userId: user.id, status: "ACCEPTED" } } },
        ],
      },
      include: {
        user: { select: { id: true, name: true } },
        _count: { select: { members: { where: { status: "ACCEPTED" } } } },
      },
      orderBy: { startDate: "asc" },
    }),
    prisma.tripMember.findMany({
      where: { userId: user.id, status: "PENDING" },
      include: { trip: { include: { user: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  // Будущие и текущие — сверху (ближайшая первой), прошедшие — внизу
  // (свежие из прошедших выше).
  const todayRef = new Date();
  const trips = [
    ...tripsRaw.filter((t) => t.endDate >= todayRef),
    ...tripsRaw.filter((t) => t.endDate < todayRef).reverse(),
  ];

  // Для каждой поездки: сколько событий в плане (отметки «иду» всех
  // участников) и сколько всего в её датах. Три batch-запроса на все
  // поездки сразу (раньше было по два COUNT на каждую, второй — с
  // трёхуровневым подзапросом; при OR: [] Prisma просто ничего не
  // вернёт, отдельная ветка на «нет поездок» не нужна).
  const [occurrences, memberRows] = await Promise.all([
    prisma.eventOccurrence.findMany({
      where: {
        OR: trips.map((t) => ({
          startsAt: { gte: t.startDate, lte: endOfDay(t.endDate) },
        })),
      },
      select: { id: true, startsAt: true },
    }),
    prisma.tripMember.findMany({
      where: { tripId: { in: trips.map((t) => t.id) }, status: "ACCEPTED" },
      select: { tripId: true, userId: true },
    }),
  ]);
  const attendanceRows = await prisma.eventAttendance.findMany({
    where: {
      occurrenceId: { in: occurrences.map((o) => o.id) },
      userId: {
        in: [...new Set([...trips.map((t) => t.userId), ...memberRows.map((m) => m.userId)])],
      },
    },
    select: { occurrenceId: true, userId: true },
  });
  const attendeesByOccurrence = new Map<string, string[]>();
  for (const a of attendanceRows) {
    const list = attendeesByOccurrence.get(a.occurrenceId);
    if (list) list.push(a.userId);
    else attendeesByOccurrence.set(a.occurrenceId, [a.userId]);
  }
  const counts = trips.map((t) => {
    const from = t.startDate;
    const to = endOfDay(t.endDate);
    const tripUserIds = new Set([
      t.userId,
      ...memberRows.filter((m) => m.tripId === t.id).map((m) => m.userId),
    ]);
    let plan = 0;
    let total = 0;
    for (const o of occurrences) {
      if (o.startsAt < from || o.startsAt > to) continue;
      total += 1;
      const attendees = attendeesByOccurrence.get(o.id);
      if (attendees?.some((u) => tripUserIds.has(u))) plan += 1;
    }
    return { plan, total };
  });

  const now = new Date();

  return (
    <div>
      <span className="eyebrow">Планирование</span>
      <h1 className="display-1-tight mt-3 mb-5" style={{ fontSize: "2.5rem" }}>
        Мои поездки
      </h1>

      <div style={{ maxWidth: "44rem" }}>
        <p className="text-secondary mb-3">
          Поездка — это даты, когда вы в Таиланде: на её странице собраны все
          события, попадающие в этот период.
        </p>
        {invites.length > 0 && (
          <div className="mb-4 d-flex flex-column gap-2">
            <h2 className="section-heading mb-0">Приглашения</h2>
            {invites.map((inv) => (
              <div
                key={inv.tripId}
                className="surface d-flex flex-wrap align-items-center justify-content-between gap-3 p-3"
              >
                <div>
                  <p className="font-display fw-medium text-white mb-0">
                    <Link href={tripHref(inv.trip)} className="text-white text-decoration-none">
                      {inv.trip.title}
                    </Link>
                  </p>
                  <p className="small text-secondary mb-0">
                    {formatShortDate(inv.trip.startDate)} – {formatShortDate(inv.trip.endDate)}{" "}
                    {inv.trip.endDate.getFullYear()} · приглашает {inv.trip.user.name ?? "друг"}
                  </p>
                </div>
                <TripInviteActions tripId={inv.tripId} />
              </div>
            ))}
          </div>
        )}

        <div className="mb-4">
          <CreateTripButton
            friends={friends.map((f) => ({ id: f.id, name: f.name ?? "Без имени", photoUrl: f.photoUrl }))}
          />
        </div>

        {trips.length === 0 ? (
          <p className="small text-secondary">Пока нет ни одной поездки.</p>
        ) : (
          <div className="d-flex flex-column gap-2">
            {trips.map((t, i) => {
              const isPast = t.endDate < now;
              return (
                <Link
                  key={t.id}
                  href={tripHref(t)}
                  className={`surface surface-hover text-decoration-none d-flex align-items-center justify-content-between gap-3 p-3 ${isPast ? "opacity-50" : ""}`}
                >
                  <div>
                    <p className="font-display fw-medium text-white mb-0">
                      {t.title}
                      {(t._count.members > 0 || t.userId !== user.id) && (
                        <span
                          className="badge rounded-pill text-bg-secondary ms-2 align-middle"
                          style={{ fontSize: "0.6rem" }}
                        >
                          совместная
                        </span>
                      )}
                    </p>
                    {t.userId !== user.id && (
                      <p className="small text-secondary mb-0">
                        Организатор: {t.user.name ?? "без имени"}
                      </p>
                    )}
                    <p className="small text-secondary mb-0">
                      <CalendarIcon className="icon-inline" />{" "}
                      {formatShortDate(t.startDate)} – {formatShortDate(t.endDate)}{" "}
                      {t.endDate.getFullYear()}
                    </p>
                  </div>
                  <span className="small text-secondary text-end flex-shrink-0">
                    {counts[i].plan} в плане · {counts[i].total} всего
                    {t.visibility !== "PRIVATE" && (
                      <span className="d-block" style={{ fontSize: "0.7rem", opacity: 0.7 }}>
                        {VISIBILITY_LABELS[t.visibility]}
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
