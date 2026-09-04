"use client";

import { useState } from "react";
import AppLink from "@/components/AppLink";
import type { StatsForTab } from "./StatsTab";
import { useLocale, useT } from "@/components/LocaleProvider";
import { formatDateWithYear } from "@/lib/dates";
import { eventHref, performerHref } from "@/lib/slugHelpers";

/** Hero-плитки статистики (события/артисты вживую, дни в Таиланде,
 *  сериалы) — теперь ОДНО место для владельца и зрителя: вкладка
 *  «Статистика» (правка владельца п.8 — обзор и чужая статистика
 *  показывали разное). Переехали из ProfileOverview вместе с
 *  раскрывающимися списками «а какие именно» (просьба владельца из
 *  прошлой волны — сохранена). */
export default function StatsHero({ stats }: { stats: StatsForTab }) {
  const t = useT();
  const locale = useLocale();
  const o = t.account.overview;
  const [expanded, setExpanded] = useState<"events" | "artists" | null>(null);

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
      hint:
        stats.episodesWatched > 0
          ? o.heroDramasEpisodes(stats.episodesWatched, stats.hoursWatched)
          : o.heroDramasHint,
    },
  ];

  return (
    <div className="mb-4">
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
                {h.expandKey && <span aria-hidden> {expanded === h.expandKey ? "▴" : "▾"}</span>}
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
                  onClick={() => setExpanded((cur) => (cur === h.expandKey ? null : h.expandKey!))}
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

      {/* Раскрытый список под плиткой: события — строками с датой,
          артисты — теми же чипами, что «Чаще всего видела вживую». */}
      {expanded === "events" && (
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
      {expanded === "artists" && (
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
    </div>
  );
}
