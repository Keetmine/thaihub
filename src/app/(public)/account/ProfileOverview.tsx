"use client";

import Link from "next/link";
import type { StatsForTab } from "./StatsTab";
import { plural } from "@/lib/plural";
import PremiumTeaser from "@/components/PremiumTeaser";

/** Счётчики профиля, но с иерархией вместо двух одинаковых рядов плиток:
 *  сверху — крупные «герои» (то, чем фанат гордится: события, актёры
 *  вживую, дни в Таиланде, досмотренные дорамы), ниже — компактные
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
  // Подписи согласуются с числом (см. lib/plural.ts): «1 артист»,
  // «2 артиста», «5 артистов» — раньше на любое число была одна форма.
  const heroes = [
    {
      icon: "🎤",
      value: stats.attendedEvents,
      label: `${plural(stats.attendedEvents, ["событие", "события", "событий"])} вживую`,
      hint: "посещено",
    },
    {
      icon: "👀",
      value: stats.performersSeenLive,
      label: `${plural(stats.performersSeenLive, ["артист", "артиста", "артистов"])} вживую`,
      hint: "увидела лично",
    },
    {
      icon: "🌴",
      value: stats.daysInThailand,
      label: `${plural(stats.daysInThailand, ["день", "дня", "дней"])} в Таиланде`,
      hint: "по поездкам",
    },
    {
      icon: "📺",
      value: stats.completedDramas,
      label: `${plural(stats.completedDramas, ["дорама", "дорамы", "дорам"])} досмотрено`,
      hint: "статус «просмотрено»",
    },
  ];

  const chips: { label: string; value: number; href?: string }[] = [
    { label: "иду", value: nav.going, href: "/events?filter=going" },
    { label: "в избранном", value: nav.favoriteEvents, href: "/events?filter=favorited" },
    {
      label: `${plural(nav.favoritePerformers, ["любимый артист", "любимых артиста", "любимых артистов"])}`,
      value: nav.favoritePerformers,
      href: "/artists",
    },
    {
      label: `${plural(nav.dramas, ["сериал", "сериала", "сериалов"])} в списке`,
      value: nav.dramas,
      href: "/dramas",
    },
    { label: plural(nav.friends, ["друг", "друга", "друзей"]), value: nav.friends, href: "/friends" },
    { label: plural(nav.trips, ["поездка", "поездки", "поездок"]), value: nav.trips, href: "/trips" },
    { label: plural(stats.uniqueVenues, ["площадка", "площадки", "площадок"]), value: stats.uniqueVenues },
    {
      label: `${plural(stats.visitedLocations, ["локация", "локации", "локаций"])} съёмок`,
      value: stats.visitedLocations,
      href: "/locations",
    },
  ];

  if (!isPremium) {
    return (
      <div className="mb-4">
        <PremiumTeaser
          title="Личная статистика — по подписке"
          description="Сколько событий и артистов вы застали вживую, дни в Таиланде, карта посещённого и ачивки."
        />
        <div className="d-flex flex-wrap gap-2">
          {chips.map((c) => {
            const inner = (
              <>
                <span className="nav-chip-value">{c.value}</span>
                <span className="nav-chip-label">{c.label}</span>
              </>
            );
            return c.href ? (
              <Link key={c.label} href={c.href} className="nav-chip">
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
