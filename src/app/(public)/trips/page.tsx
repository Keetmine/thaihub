import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { endOfDay, formatShortDate } from "@/lib/dates";
import CreateTripButton from "./CreateTripButton";
import PremiumUpsell from "@/components/PremiumUpsell";
import { VISIBILITY_LABELS } from "@/lib/tripVisibility";
import { CalendarIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function TripsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Поездки целиком — платная функция (см. PremiumUpsell / /admin/users).
  if (!user.isPremium) {
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

  const trips = await prisma.trip.findMany({
    where: { userId: user.id },
    orderBy: { startDate: "asc" },
  });

  // Для каждой поездки: сколько событий в плане (владелец «идёт») и
  // сколько всего в её датах.
  const counts = await Promise.all(
    trips.map(async (t) => {
      const range = { startsAt: { gte: t.startDate, lte: endOfDay(t.endDate) } };
      const [plan, total] = await Promise.all([
        prisma.eventOccurrence.count({
          where: { ...range, event: { attendees: { some: { userId: user.id } } } },
        }),
        prisma.eventOccurrence.count({ where: range }),
      ]);
      return { plan, total };
    }),
  );

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
        <div className="mb-4">
          <CreateTripButton />
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
                  href={`/trips/${t.id}`}
                  className={`surface surface-hover text-decoration-none d-flex align-items-center justify-content-between gap-3 p-3 ${isPast ? "opacity-50" : ""}`}
                >
                  <div>
                    <p className="font-display fw-medium text-white mb-0">{t.title}</p>
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
