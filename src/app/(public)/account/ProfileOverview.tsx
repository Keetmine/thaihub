"use client";

import AppLink from "@/components/AppLink";
import type { StatsForTab } from "./StatsTab";
import { useT } from "@/components/LocaleProvider";
import PremiumTeaser from "@/components/PremiumTeaser";

/** Счётчики профиля, но с иерархией вместо двух одинаковых рядов плиток:
 *  сверху — крупные «герои» (то, чем фанат гордится: события, актёры
 *  вживую, дни в Таиланде, досмотренные сериалы), ниже — компактные
 *  чипы-ссылки в разделы (иду, избранное, друзья…). Раньше оба ряда
 *  выглядели одинаково, хотя первый — навигация, второй — достижения. */
export default function ProfileOverview({
  stats,
  nav,
  isPremium,
}: {
  stats: StatsForTab;
  nav: {
    going: number;
    favoriteEvents: number;
    favoritePerformers: number;
    dramas: number;
    friends: number;
    trips: number;
  };
  /** Счётчики «вживую» и «дни в Таиланде» — часть платной статистики
   *  (см. features/gamification.md): без подписки вместо цифр показываем,
   *  что за ней. Навигационные чипы остаются всем. */
  isPremium: boolean;
}) {
  const t = useT();
  const o = t.account.overview;

  // Подписи согласуются с числом (см. lib/plural.ts): «1 артист»,
  // «2 артиста», «5 артистов» — раньше на любое число была одна форма.
  const heroes = [
    {
      icon: "🎤",
      value: stats.attendedEvents,
      label: o.heroEvents(stats.attendedEvents),
      hint: o.heroEventsHint,
    },
    {
      icon: "👀",
      value: stats.performersSeenLive,
      label: o.heroArtists(stats.performersSeenLive),
      hint: o.heroArtistsHint,
    },
    {
      icon: "🌴",
      value: stats.daysInThailand,
      label: o.heroDays(stats.daysInThailand),
      hint: o.heroDaysHint,
    },
    {
      icon: "📺",
      value: stats.completedDramas,
      label: o.heroDramas(stats.completedDramas),
      hint: o.heroDramasHint,
    },
  ];

  const chips: { label: string; value: number; href?: string }[] = [
    { label: o.chipGoing, value: nav.going, href: "/events?filter=going" },
    { label: o.chipFavoriteEvents, value: nav.favoriteEvents, href: "/events?filter=favorited" },
    {
      label: o.chipPerformers(nav.favoritePerformers),
      value: nav.favoritePerformers,
      href: "/artists",
    },
    {
      label: o.chipDramas(nav.dramas),
      value: nav.dramas,
      href: "/dramas",
    },
    { label: o.chipFriends(nav.friends), value: nav.friends, href: "/friends" },
    { label: o.chipTrips(nav.trips), value: nav.trips, href: "/trips" },
    { label: o.chipVenues(stats.uniqueVenues), value: stats.uniqueVenues },
    {
      label: o.chipLocations(stats.visitedLocations),
      value: stats.visitedLocations,
      href: "/locations",
    },
  ];

  if (!isPremium) {
    return (
      <div className="mb-4">
        <PremiumTeaser title={o.lockedTitle} description={o.lockedDescription} />
        <div className="d-flex flex-wrap gap-2">
          {chips.map((c) => {
            const inner = (
              <>
                <span className="nav-chip-value">{c.value}</span>
                <span className="nav-chip-label">{c.label}</span>
              </>
            );
            return c.href ? (
              <AppLink key={c.label} href={c.href} className="nav-chip">
                {inner}
              </AppLink>
            ) : (
              <span key={c.label} className="nav-chip">
                {inner}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div className="row g-2 mb-3">
        {heroes.map((h) => (
          <div key={h.label} className="col-6 col-lg-3">
            <div className="hero-stat h-100">
              <span className="hero-stat-value">{h.value}</span>
              <span className="hero-stat-label">
                <span className="hero-stat-icon">{h.icon}</span> {h.label}
              </span>
              <span className="hero-stat-hint">{h.hint}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="d-flex flex-wrap gap-2">
        {chips.map((c) => {
          const inner = (
            <>
              <span className="nav-chip-value">{c.value}</span>
              <span className="nav-chip-label">{c.label}</span>
            </>
          );
          return c.href ? (
            <AppLink
              key={c.label}
              href={c.href}
              className="nav-chip nav-chip-link text-decoration-none"
            >
              {inner}
            </AppLink>
          ) : (
            <span key={c.label} className="nav-chip">
              {inner}
            </span>
          );
        })}
      </div>
    </div>
  );
}
