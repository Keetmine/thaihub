"use client";

import { useState } from "react";
import AppLink from "@/components/AppLink";
import type { StatsForTab } from "./StatsTab";
import { useLocale, useT } from "@/components/LocaleProvider";
import { formatDateWithYear } from "@/lib/dates";
import { eventHref, performerHref } from "@/lib/slugHelpers";

/** Счётчики СВОЕГО профиля (вкладка «Обзор»): сверху — крупные «герои»
 *  (то, чем фанат гордится: события, актёры вживую, дни в Таиланде,
 *  досмотренные сериалы), ниже — компактные чипы-ссылки в разделы (иду,
 *  избранное, друзья…). У бесплатного аккаунта героев нет (личная
 *  статистика платная — см. features/gamification.md), но чипы остаются:
 *  это навигация, а не достижения. Гигантского пейволла здесь больше
 *  нет — компактный апселл живёт один, во вкладке «Статистика». */
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
  isPremium: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const o = t.account.overview;
  // Раскрытая плитка: за числами «событий вживую» и «артистов вживую»
  // стоят конкретные списки (просьба владельца — по клику показывать,
  // что именно засчитано), клик по плитке разворачивает их под рядом.
  const [expanded, setExpanded] = useState<"events" | "artists" | null>(null);

  // Подписи согласуются с числом (см. lib/plural.ts): «1 артист»,
  // «2 артиста», «5 артистов» — раньше на любое число была одна форма.
  const heroes: {
    icon: string;
    value: number;
    label: string;
    hint: string;
    expandKey?: "events" | "artists";
  }[] = [
    {
      icon: "🎤",
      value: stats.attendedEvents,
      label: o.heroEvents(stats.attendedEvents),
      hint: o.heroEventsHint,
      expandKey: stats.attendedEventsList.length > 0 ? "events" : undefined,
    },
    {
      icon: "👀",
      value: stats.performersSeenLive,
      label: o.heroArtists(stats.performersSeenLive),
      hint: o.heroArtistsHint,
      expandKey: stats.seenPerformers.length > 0 ? "artists" : undefined,
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
      // Серии и часы у экрана — вместо статичной подписи, когда есть что
      // считать: «74 серии · ~55 ч».
      hint:
        stats.episodesWatched > 0
          ? o.heroDramasEpisodes(stats.episodesWatched, stats.hoursWatched)
          : o.heroDramasHint,
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
    // Площадок (venues) в счётчиках больше нет — правка владельца:
    // информация о площадках из статистики профиля убрана целиком.
    {
      label: o.chipLocations(stats.visitedLocations),
      value: stats.visitedLocations,
      href: "/locations",
    },
  ];

  return (
    <div className="mb-4">
      {isPremium && (
        <div className="row g-2 mb-3">
          {heroes.map((h) => {
            const inner = (
              <>
                <span className="hero-stat-value">{h.value}</span>
                <span className="hero-stat-label">
                  <span className="hero-stat-icon">{h.icon}</span> {h.label}
                </span>
                <span className="hero-stat-hint">
                  {h.hint}
                  {h.expandKey && (
                    <span aria-hidden> {expanded === h.expandKey ? "▴" : "▾"}</span>
                  )}
                </span>
              </>
            );
            return (
              <div key={h.label} className="col-6 col-xl-3">
                {h.expandKey ? (
                  <button
                    type="button"
                    className={`hero-stat hero-stat-toggle h-100 w-100${expanded === h.expandKey ? " is-open" : ""}`}
                    aria-expanded={expanded === h.expandKey}
                    onClick={() =>
                      setExpanded((cur) => (cur === h.expandKey ? null : h.expandKey!))
                    }
                  >
                    {inner}
                  </button>
                ) : (
                  <div className="hero-stat h-100">{inner}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Раскрытый список под плиткой: события — строками с датой,
          артисты — теми же чипами, что «Чаще всего видела вживую». */}
      {isPremium && expanded === "events" && (
        <div className="surface p-3 mb-3">
          <div className="d-flex flex-column gap-1">
            {stats.attendedEventsList.map((ev) => (
              <AppLink
                key={ev.id}
                href={eventHref(ev)}
                className="d-flex justify-content-between gap-3 text-decoration-none py-1"
              >
                <span className="text-white text-truncate">{ev.title}</span>
                <span className="small text-secondary flex-shrink-0">
                  {formatDateWithYear(new Date(ev.date), locale)}
                </span>
              </AppLink>
            ))}
          </div>
        </div>
      )}
      {isPremium && expanded === "artists" && (
        <div className="surface p-3 mb-3 d-flex flex-wrap gap-2">
          {stats.seenPerformers.map((p) => (
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
            </AppLink>
          ))}
        </div>
      )}

      <div className="d-flex flex-wrap gap-2">
        {/* Нулевые чипы не показываем: у нового бесплатного аккаунта ряд
            «0 иду · 0 в избранном · …» выглядел уродливо (жалоба
            владельца), а навигация в эти разделы и так есть в шапке. */}
        {chips.filter((c) => c.value > 0).map((c) => {
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
