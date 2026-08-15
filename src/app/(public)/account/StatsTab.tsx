"use client";

import Link from "next/link";
import LocationMapLoader from "@/components/LocationMapLoader";
import { performerHref } from "@/lib/performerSlug";

// Сериализуемые версии для клиентской вкладки (Д1/Д2).
export type StatsForTab = {
  attendedEvents: number;
  upcomingEvents: number;
  uniqueVenues: number;
  performersSeenLive: number;
  topPerformers: { id: string; name: string; slug: string | null; photoUrl: string | null; count: number }[];
  visitedLocations: number;
  visitedLocationPins: { id: string; name: string; latitude: number; longitude: number }[];
  completedDramas: number;
  trips: number;
  daysInThailand: number;
  friends: number;
  eventsByYear: { year: number; count: number }[];
};

export type AchievementForTab = {
  key: string;
  emoji: string;
  title: string;
  description: string;
  unlocked: boolean;
  value: number;
  target: number;
};

function Tile({ value, label }: { value: number; label: string }) {
  return (
    <div className="surface text-center p-3 flex-fill" style={{ minWidth: "8rem" }}>
      <span className="font-display fw-bold d-block" style={{ fontSize: "1.5rem" }}>
        {value}
      </span>
      <span className="small text-secondary">{label}</span>
    </div>
  );
}

const heading = { letterSpacing: "0.08em" } as const;

export default function StatsTab({
  stats,
  achievements,
}: {
  stats: StatsForTab;
  achievements: AchievementForTab[];
}) {
  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const maxYear = Math.max(1, ...stats.eventsByYear.map((y) => y.count));

  return (
    <div>
      <h2 className="small text-secondary text-uppercase mb-2" style={heading}>
        Мой фан-профиль
      </h2>
      <div className="d-flex flex-wrap gap-2 mb-4">
        <Tile value={stats.attendedEvents} label="посещено событий" />
        <Tile value={stats.uniqueVenues} label="площадок" />
        <Tile value={stats.performersSeenLive} label="актёров вживую" />
        <Tile value={stats.visitedLocations} label="локаций съёмок" />
        <Tile value={stats.completedDramas} label="досмотрено дорам" />
        <Tile value={stats.trips} label="поездок" />
        <Tile value={stats.daysInThailand} label="дней в Таиланде" />
      </div>

      {stats.topPerformers.length > 0 && (
        <>
          <h2 className="small text-secondary text-uppercase mb-2" style={heading}>
            Чаще всего видела вживую
          </h2>
          <div className="d-flex flex-wrap gap-2 mb-4">
            {stats.topPerformers.map((p) => (
              <Link
                key={p.id}
                href={performerHref(p)}
                className="surface surface-hover text-decoration-none d-flex align-items-center gap-2 p-2 pe-3"
              >
                {p.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.photoUrl}
                    alt=""
                    className="rounded-circle"
                    style={{ width: "2.2rem", height: "2.2rem", objectFit: "cover" }}
                  />
                ) : (
                  <span
                    className="rounded-circle d-inline-block"
                    style={{ width: "2.2rem", height: "2.2rem", background: "var(--bs-secondary-bg)" }}
                  />
                )}
                <span className="small text-white">{p.name}</span>
                <span className="small text-secondary">×{p.count}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {stats.eventsByYear.length > 0 && (
        <>
          <h2 className="small text-secondary text-uppercase mb-2" style={heading}>
            События по годам
          </h2>
          <div className="d-flex align-items-end gap-3 mb-4" style={{ height: "6rem" }}>
            {stats.eventsByYear.map((y) => (
              <div key={y.year} className="text-center d-flex flex-column justify-content-end" style={{ height: "100%" }}>
                <span className="small text-secondary d-block">{y.count}</span>
                <div
                  className="mx-auto"
                  style={{
                    width: "2rem",
                    height: `${Math.max(8, (y.count / maxYear) * 60)}px`,
                    background: "var(--bs-primary)",
                    borderRadius: "0.3rem 0.3rem 0 0",
                    opacity: 0.85,
                  }}
                />
                <span className="small text-secondary d-block">{y.year}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {stats.visitedLocationPins.length > 0 && (
        <>
          <h2 className="small text-secondary text-uppercase mb-2" style={heading}>
            Карта посещённого
          </h2>
          <div className="mb-4">
            <LocationMapLoader locations={stats.visitedLocationPins} height="20rem" />
          </div>
        </>
      )}

      <h2 className="small text-secondary text-uppercase mb-2" style={heading}>
        Ачивки · {unlockedCount}/{achievements.length}
      </h2>
      <div className="row g-2 mb-4">
        {achievements.map((a) => (
          <div key={a.key} className="col-6 col-md-4 col-lg-3">
            <div
              className="surface p-3 h-100"
              style={a.unlocked ? undefined : { opacity: 0.45 }}
              title={a.description}
            >
              <div className="d-flex align-items-center gap-2 mb-1">
                <span style={{ fontSize: "1.3rem" }}>{a.emoji}</span>
                <span className="small fw-semibold text-white">{a.title}</span>
              </div>
              <p className="small text-secondary mb-2" style={{ fontSize: "0.72rem" }}>
                {a.description}
              </p>
              {!a.unlocked && a.target > 1 && (
                <div className="progress" style={{ height: "0.3rem" }}>
                  <div
                    className="progress-bar bg-primary"
                    style={{ width: `${Math.round((a.value / a.target) * 100)}%` }}
                  />
                </div>
              )}
              {!a.unlocked && a.target > 1 && (
                <span className="small text-secondary" style={{ fontSize: "0.7rem" }}>
                  {a.value}/{a.target}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
