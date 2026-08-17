"use client";

import Link from "next/link";
import LocationMapLoader from "@/components/LocationMapLoader";
import StatTile from "@/components/StatTile";
import { performerHref } from "@/lib/performerSlug";
import { artistListHref } from "@/lib/slugHelpers";
import CreateArtistListButton from "@/app/(public)/artist-lists/CreateArtistListButton";

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

export default function StatsTab({
  stats,
  achievements,
  artistLists,
}: {
  stats: StatsForTab;
  achievements: AchievementForTab[];
  artistLists?: {
    id: string;
    slug: string | null;
    title: string;
    items: { id: string; slug: string | null; name: string; photoUrl: string | null }[];
  }[];
}) {
  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const maxYear = Math.max(1, ...stats.eventsByYear.map((y) => y.count));

  return (
    <div>
      <h2 className="section-heading mb-2">
        Мой фан-профиль
      </h2>
      <div className="d-flex flex-wrap gap-2 mb-4">
        <StatTile value={stats.attendedEvents} label="посещено событий" />
        <StatTile value={stats.uniqueVenues} label="площадок" />
        <StatTile value={stats.performersSeenLive} label="актёров вживую" />
        <StatTile value={stats.visitedLocations} label="локаций съёмок" />
        <StatTile value={stats.completedDramas} label="досмотрено дорам" />
        <StatTile value={stats.trips} label="поездок" />
        <StatTile value={stats.daysInThailand} label="дней в Таиланде" />
      </div>

      {stats.topPerformers.length > 0 && (
        <>
          <h2 className="section-heading mb-2">
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

        {/* Кастомные списки актёров — в том же чип-формате, что
            «Чаще всего видела вживую». */}
        <div className="d-flex flex-wrap align-items-center gap-3 mb-2">
          <h2 className="section-heading mb-0">Мои списки актёров</h2>
          <CreateArtistListButton small />
        </div>
        {(artistLists ?? []).length === 0 ? (
          <p className="small text-secondary mb-4">
            Создайте свой список — «видела вживую», «пил пиво»…
          </p>
        ) : (
          <div className="d-flex flex-column gap-3 mb-4">
            {(artistLists ?? []).map((l) => (
              <div key={l.id}>
                <Link
                  href={artistListHref(l)}
                  className="small text-secondary text-decoration-none d-inline-block mb-2"
                >
                  {l.title} ({l.items.length}) →
                </Link>
                <div className="d-flex flex-wrap gap-2">
                  {l.items.length === 0 && (
                    <span className="small text-secondary">Пока пусто</span>
                  )}
                  {l.items.map((p) => (
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
                          className="rounded-circle d-inline-flex align-items-center justify-content-center small"
                          style={{
                            width: "2.2rem",
                            height: "2.2rem",
                            background: "var(--bs-secondary-bg)",
                            color: "var(--bs-secondary-color)",
                            opacity: 0.7,
                            fontWeight: 600,
                          }}
                        >
                          {p.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className="small text-white">{p.name}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

      {stats.eventsByYear.length > 0 && (
        <>
          <h2 className="section-heading mb-2">
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
          <h2 className="section-heading mb-2">
            Карта посещённого
          </h2>
          <div className="mb-4">
            <LocationMapLoader locations={stats.visitedLocationPins} height="20rem" />
          </div>
        </>
      )}

      <h2 className="section-heading mb-2">
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
