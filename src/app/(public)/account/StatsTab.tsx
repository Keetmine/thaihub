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
        <StatTile value={stats.attendedEvents} label="посещено событий" icon="🎤" muted />
        <StatTile value={stats.uniqueVenues} label="площадок" icon="📍" muted />
        <StatTile value={stats.performersSeenLive} label="актёров вживую" icon="👀" muted />
        <StatTile value={stats.visitedLocations} label="локаций съёмок" icon="🎬" muted />
        <StatTile value={stats.completedDramas} label="досмотрено дорам" icon="📺" muted />
        <StatTile value={stats.trips} label="поездок" icon="✈️" muted />
        <StatTile value={stats.daysInThailand} label="дней в Таиланде" icon="🌴" muted />
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

      {/* Ачивки: полученные впереди и с акцентом, остальные — по
          близости к цели (сначала те, до которых рукой подать). */}
      <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
        <h2 className="section-heading mb-0">Ачивки</h2>
        <span className="small text-secondary">
          {unlockedCount} из {achievements.length}
        </span>
        <div className="achv-bar flex-fill" style={{ maxWidth: "12rem" }}>
          <span style={{ width: `${Math.round((unlockedCount / achievements.length) * 100)}%` }} />
        </div>
      </div>
      <div className="row g-2 mb-4">
        {[...achievements]
          .sort((a, b) => {
            if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
            return b.value / Math.max(b.target, 1) - a.value / Math.max(a.target, 1);
          })
          .map((a) => {
            const pct = Math.min(100, Math.round((a.value / Math.max(a.target, 1)) * 100));
            return (
              <div key={a.key} className="col-6 col-md-4 col-lg-3">
                <div
                  className={`achv d-flex flex-column gap-2 ${a.unlocked ? "achv-unlocked" : "achv-locked"}`}
                  title={a.description}
                >
                  <div className="d-flex align-items-center gap-2">
                    <span className="achv-badge">{a.emoji}</span>
                    <span style={{ minWidth: 0 }}>
                      <span className="achv-title d-block">{a.title}</span>
                      {a.unlocked && (
                        <span className="small" style={{ color: "var(--bs-primary-text-emphasis)", fontSize: "0.7rem" }}>
                          ✓ получена
                        </span>
                      )}
                    </span>
                  </div>
                  <p className="achv-desc">{a.description}</p>
                  {!a.unlocked && a.target > 1 && (
                    <div className="mt-auto">
                      <div className="achv-bar mb-1">
                        <span style={{ width: `${pct}%` }} />
                      </div>
                      <span className="small text-secondary" style={{ fontSize: "0.7rem" }}>
                        {a.value} / {a.target}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
