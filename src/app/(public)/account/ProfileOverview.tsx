"use client";

import Link from "next/link";
import type { StatsForTab } from "./StatsTab";

/** Счётчики профиля, но с иерархией вместо двух одинаковых рядов плиток:
 *  сверху — крупные «герои» (то, чем фанат гордится: события, актёры
 *  вживую, дни в Таиланде, досмотренные дорамы), ниже — компактные
 *  чипы-ссылки в разделы (иду, избранное, друзья…). Раньше оба ряда
 *  выглядели одинаково, хотя первый — навигация, второй — достижения. */
export default function ProfileOverview({
  stats,
  nav,
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
}) {
  const heroes = [
    { icon: "🎤", value: stats.attendedEvents, label: "событий вживую", hint: "посещено" },
    { icon: "👀", value: stats.performersSeenLive, label: "артистов вживую", hint: "увидела лично" },
    { icon: "🌴", value: stats.daysInThailand, label: "дней в Таиланде", hint: "по поездкам" },
    { icon: "📺", value: stats.completedDramas, label: "дорам досмотрено", hint: "статус «просмотрено»" },
  ];

  const chips: { label: string; value: number; href?: string }[] = [
    { label: "иду", value: nav.going, href: "/?filter=going" },
    { label: "в избранном", value: nav.favoriteEvents, href: "/?filter=favorited" },
    { label: "любимых артистов", value: nav.favoritePerformers, href: "/artists" },
    { label: "сериалов в списке", value: nav.dramas, href: "/dramas" },
    { label: "друзей", value: nav.friends, href: "/friends" },
    { label: "поездок", value: nav.trips, href: "/trips" },
    { label: "площадок", value: stats.uniqueVenues },
    { label: "локаций съёмок", value: stats.visitedLocations, href: "/locations" },
  ];

  return (
    <div className="mb-4">
      <div className="row g-2 mb-3">
        {heroes.map((h) => (
          <div key={h.label} className="col-6 col-lg-3">
            <div className="hero-stat h-100">
              <span className="hero-stat-icon">{h.icon}</span>
              <span className="hero-stat-value">{h.value}</span>
              <span className="hero-stat-label">{h.label}</span>
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
            <Link key={c.label} href={c.href} className="nav-chip nav-chip-link text-decoration-none">
              {inner}
            </Link>
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
