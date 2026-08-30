"use client";

import AppLink from "@/components/AppLink";
import { useLocale, useT } from "@/components/LocaleProvider";
import LocationMapLoader from "@/components/LocationMapLoader";
import { performerHref } from "@/lib/performerSlug";
import { artistListHref } from "@/lib/slugHelpers";
import CreateArtistListButton from "@/app/(public)/artist-lists/CreateArtistListButton";
import PremiumTeaser from "@/components/PremiumTeaser";
import AchievementBadge from "@/components/AchievementBadge";

// Сериализуемые версии для клиентской вкладки (Д1/Д2).
export type StatsForTab = {
  attendedEvents: number;
  upcomingEvents: number;
  uniqueVenues: number;
  performersSeenLive: number;
  /** Списки под кликабельными плитками обзора: какие события посещены и
   *  кого видели вживую (дата — ISO-строкой, серверная сериализация). */
  attendedEventsList: { id: string; slug: string | null; title: string; date: string }[];
  seenPerformers: { id: string; name: string; slug: string | null; photoUrl: string | null }[];
  topPerformers: { id: string; name: string; slug: string | null; photoUrl: string | null; count: number }[];
  visitedLocations: number;
  visitedLocationPins: { id: string; name: string; latitude: number; longitude: number }[];
  completedDramas: number;
  episodesWatched: number;
  hoursWatched: number;
  trips: number;
  daysInThailand: number;
  friends: number;
  eventsByYear: { year: number; count: number }[];
};

// Только полученные ачивки — неполученные в кабинет не приходят вовсе
// («чтобы было сюрпризом»), поэтому нет ни value/target, ни прогресс-баров.
export type AchievementForTab = {
  key: string;
  emoji: string;
  title: string;
  hint: string;
  unlockedAt: Date | null;
};

export default function StatsTab({
  stats,
  achievements,
  achievementsTotal,
  artistLists,
  isPremium,
}: {
  stats: StatsForTab;
  achievements: AchievementForTab[];
  /** Сколько всего ВКЛЮЧЁННЫХ ачивок существует — для «7 из 22». */
  achievementsTotal: number;
  /** Ачивки и создание списков актёров — платные (см. roadmap). Уже
   *  созданные списки остаются доступными: отбирать сделанное нельзя. */
  isPremium?: boolean;
  artistLists?: {
    id: string;
    slug: string | null;
    title: string;
    items: { id: string; slug: string | null; name: string; photoUrl: string | null }[];
  }[];
}) {
  const t = useT();
  const locale = useLocale();
  const s = t.account.stats;
  const maxYear = Math.max(1, ...stats.eventsByYear.map((y) => y.count));

  return (
    <div>
      {stats.topPerformers.length > 0 && (
        <>
          <h2 className="section-heading mb-2">{s.topPerformers}</h2>
          <div className="d-flex flex-wrap gap-2 mb-4">
            {stats.topPerformers.map((p) => (
              <AppLink
                key={p.id}
                href={performerHref(p)}
                className="surface surface-hover text-decoration-none d-flex align-items-center gap-2 p-2 pe-3"
              >
                {p.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    loading="lazy"
                    decoding="async"
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
              </AppLink>
            ))}
          </div>
        </>
      )}

        {/* Кастомные списки актёров — в том же чип-формате, что
            «Чаще всего видела вживую». */}
        <div className="d-flex flex-wrap align-items-center gap-3 mb-2">
          <h2 className="section-heading mb-0">{s.artistLists}</h2>
          {/* Новые списки — по подписке, но уже созданные остаются
              доступны: отбирать сделанное нельзя. */}
          {isPremium && <CreateArtistListButton small />}
        </div>
        {(artistLists ?? []).length === 0 ? (
          isPremium ? (
            <p className="small text-secondary mb-4">{s.artistListsHint}</p>
          ) : (
            <p className="small text-secondary mb-4">
              {s.artistListsLocked}{" "}
              <AppLink href="/calendar" className="link-body-emphasis">
                {s.artistListsLockedCta}
              </AppLink>
            </p>
          )
        ) : (
          <div className="row g-2 mb-4">
            {(artistLists ?? []).map((l) => (
              <div key={l.id} className="col-12 col-md-6">
                <AppLink href={artistListHref(l)} className="list-card text-decoration-none">
                  <span className="facepile">
                    {l.items.slice(0, 4).map((p) =>
                      p.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img loading="lazy" decoding="async" key={p.id} src={p.photoUrl} alt="" />
                      ) : (
                        <span key={p.id}>{p.name.charAt(0).toUpperCase()}</span>
                      ),
                    )}
                    {l.items.length === 0 && <span>—</span>}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span className="d-block text-white fw-medium text-truncate">{l.title}</span>
                    <span className="small text-secondary">
                      {l.items.length === 0 ? s.listEmpty : s.listCount(l.items.length)}
                      {l.items.length > 4 && ` · ${l.items.slice(0, 2).map((p) => p.name).join(", ")}…`}
                    </span>
                  </span>
                  <span className="ms-auto text-secondary flex-shrink-0">→</span>
                </AppLink>
              </div>
            ))}
          </div>
        )}

      {stats.eventsByYear.length > 0 && (
        <>
          <h2 className="section-heading mb-2">{s.byYear}</h2>
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
          <h2 className="section-heading mb-2">{s.visitedMap}</h2>
          <div className="mb-4">
            <LocationMapLoader locations={stats.visitedLocationPins} height="20rem" />
          </div>
        </>
      )}

      {/* Ачивки (Э2ф): показываются ТОЛЬКО полученные — неполученные
          остаются сюрпризом, о них говорит лишь счётчик «N из M».
          Раздел платный (см. roadmap). */}
      {!isPremium ? (
        <PremiumTeaser
          title={s.achievementsLockedTitle}
          description={s.achievementsLockedDescription(achievementsTotal)}
        />
      ) : (
      <>
      <div className="d-flex flex-wrap align-items-baseline gap-2 mb-2">
        <h2 className="section-heading mb-0">{s.achievements}</h2>
        <span className="small text-secondary">
          {s.achievementsProgress(achievements.length, achievementsTotal)}
          {achievements.length < achievementsTotal && s.achievementsSecret}
        </span>
      </div>
      {achievements.length === 0 ? (
        <p className="small text-secondary mb-4">{s.achievementsEmpty}</p>
      ) : (
        <div className="row g-2 mb-4">
          {achievements.map((a) => (
            <div key={a.key} className="col-6 col-md-4 col-lg-3">
              <AchievementBadge
                emoji={a.emoji}
                title={a.title}
                hint={a.hint}
                unlocked
                unlockedAt={a.unlockedAt}
                locale={locale}
              />
            </div>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  );
}
