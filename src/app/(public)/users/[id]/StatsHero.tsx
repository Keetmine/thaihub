"use client";

import { useState } from "react";
import AppLink from "@/components/AppLink";
import type { StatsForTab } from "./StatsTab";
import { useLocale, useT } from "@/components/LocaleProvider";
import { formatDateWithYear } from "@/lib/dates";
import { dramaTitleForLocale } from "@/lib/dramaLocale";
import { eventHref, performerHref, tripHref } from "@/lib/slugHelpers";

type Expanded = "events" | "artists" | "trips" | null;

/** Плитки статистики над карточками вкладки — ОДНО место для владельца
 *  и зрителя (правка владельца п.8 — обзор и чужая статистика показывали
 *  разное).
 *
 *  Пятая редакция внешнего вида (2026-09-17). Владелец: «мне нравится,
 *  что это отдельно статистика, но надо визуально переделать». Тёмные
 *  коробки с оранжевым свечением, полоса с разделителями, цифры внутри
 *  карточек, потом цветные плитки («слишком выделяются») — итог:
 *  нейтральная поверхность как у остальных карточек, иконка крупным
 *  полупрозрачным водяным знаком в углу, число крупное, а раскрытие
 *  обозначено явной круглой кнопкой со стрелкой в углу плитки — прежний
 *  символ рядом с подсказкой был «очень маленький, непонятно, что там».
 *
 *  Раскрытие — под рядом: события строками с постером, артисты сеткой
 *  круглых фото (порядок по пейрингам задаёт свод), поездки — название,
 *  даты, длина. Панель не выше 15rem, дальше прокрутка внутри (правка
 *  владельца: при 20–40 событиях иначе занимала бы всю страницу). */
export default function StatsHero({ stats }: { stats: StatsForTab }) {
  const t = useT();
  const locale = useLocale();
  const o = t.account.overview;
  const s = t.account.stats;
  const [expanded, setExpanded] = useState<Expanded>(null);

  const tiles: {
    key: string;
    icon: string;
    value: number;
    label: string;
    hint: string;
    expandKey?: Exclude<Expanded, null>;
  }[] = [
    {
      key: "events",
      icon: "🎤",
      value: stats.attendedEvents,
      label: o.heroEvents(stats.attendedEvents),
      hint: o.heroEventsHint,
      expandKey: stats.attendedEventsList.length > 0 ? "events" : undefined,
    },
    {
      key: "artists",
      icon: "👀",
      value: stats.performersSeenLive,
      label: o.heroArtists(stats.performersSeenLive),
      hint: o.heroArtistsHint,
      expandKey: stats.seenPerformers.length > 0 ? "artists" : undefined,
    },
    {
      key: "trips",
      icon: "🧳",
      value: stats.daysInThailand,
      label: o.heroDays(stats.daysInThailand),
      // Подсказка — сколько поездок; по клику список (только владельцу:
      // у поездок своя видимость, зрителю страница список не отдаёт).
      hint: `${stats.trips} ${s.tripsFigure(stats.trips)}`,
      expandKey: stats.tripsList.length > 0 ? "trips" : undefined,
    },
    {
      key: "series",
      icon: "📺",
      value: stats.completedDramas,
      label: o.heroDramas(stats.completedDramas),
      hint:
        stats.episodesWatched > 0
          ? o.heroDramasEpisodes(stats.episodesWatched, stats.hoursWatched)
          : o.heroDramasHint,
    },
  ];

  // Пересмотры — той же плиткой и только когда они есть: у большинства
  // их нет вовсе, а плитка с нулём ничего не сообщает (правка
  // владельца). Подпись — что пересматривали чаще прочего.
  if (stats.rewatchTotal) {
    tiles.push({
      key: "rewatch",
      icon: "🔁",
      value: stats.rewatchTotal,
      label: o.heroRewatches(stats.rewatchTotal),
      hint: stats.mostRewatched
        ? o.heroRewatchesTop(
            dramaTitleForLocale(stats.mostRewatched, locale),
            stats.mostRewatched.count,
          )
        : o.heroRewatchesHint,
    });
  }

  return (
    <div className="mb-4">
      <div className="stat-tiles mb-3">
        {tiles.map((tile) => {
          const inner = (
            <>
              <span className="stat-tile-icon" aria-hidden>
                {tile.icon}
              </span>
              <span className="stat-tile-value">{tile.value}</span>
              <span className="stat-tile-label">{tile.label}</span>
              <span className="stat-tile-hint">{tile.hint}</span>
              {tile.expandKey && (
                <span className="stat-tile-chevron" aria-hidden>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6l5 5 5-5" />
                  </svg>
                </span>
              )}
            </>
          );
          const cls = "stat-tile";
          return tile.expandKey ? (
            <button
              key={tile.key}
              type="button"
              className={`${cls} stat-tile-toggle${expanded === tile.expandKey ? " is-open" : ""}`}
              aria-expanded={expanded === tile.expandKey}
              onClick={() =>
                setExpanded((cur) => (cur === tile.expandKey ? null : tile.expandKey!))
              }
            >
              {inner}
            </button>
          ) : (
            <div key={tile.key} className={cls}>
              {inner}
            </div>
          );
        })}
      </div>

      {/* Панели всегда в DOM и раскрываются плавно по высоте (грид
          0fr → 1fr, см. .stat-tile-panel): условный рендер появлялся
          рывком (правка владельца 2026-09-17: «не плавно»). Закрытая
          панель — inert, чтобы ссылки внутри не ловили фокус. */}
      <div
        className={`stat-tile-panel${expanded === "events" ? " is-open" : ""}`}
        inert={expanded !== "events"}
      >
        <div className="stat-tile-panel-inner">
        <div className="surface p-3 stat-tile-expand thin-scroll">
          <div className="hero-event-list">
            {stats.attendedEventsList.map((ev) => (
              <AppLink key={ev.id} href={eventHref(ev)} className="hero-event-row">
                {ev.posterUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    loading="lazy"
                    decoding="async"
                    src={ev.posterUrl}
                    alt=""
                    className="hero-event-poster"
                  />
                ) : (
                  <span className="hero-event-poster hero-event-fallback">{ev.title.slice(0, 1)}</span>
                )}
                <span className="hero-event-body">
                  <span className="hero-event-title">{ev.title}</span>
                  <span className="hero-event-meta">
                    {formatDateWithYear(new Date(ev.date), locale)}
                    {ev.venue && ` · ${ev.venue}`}
                  </span>
                </span>
              </AppLink>
            ))}
          </div>
        </div>
        </div>
      </div>
      <div
        className={`stat-tile-panel${expanded === "artists" ? " is-open" : ""}`}
        inert={expanded !== "artists"}
      >
        <div className="stat-tile-panel-inner">
        <div className="surface p-3 stat-tile-expand thin-scroll">
          <div className="hero-artist-grid">
            {stats.seenPerformers.map((p) => (
              <AppLink key={p.id} href={performerHref(p)} className="hero-artist">
                {p.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    loading="lazy"
                    decoding="async"
                    src={p.photoUrl}
                    alt=""
                    className="hero-artist-photo"
                  />
                ) : (
                  <span className="hero-artist-photo hero-artist-fallback">{p.name.slice(0, 1)}</span>
                )}
                <span className="hero-artist-name">{p.name}</span>
              </AppLink>
            ))}
          </div>
        </div>
        </div>
      </div>
      <div
        className={`stat-tile-panel${expanded === "trips" ? " is-open" : ""}`}
        inert={expanded !== "trips"}
      >
        <div className="stat-tile-panel-inner">
        <div className="surface p-3 stat-tile-expand thin-scroll">
          <div className="hero-event-list">
            {stats.tripsList.map((trip) => (
              <AppLink key={trip.id} href={tripHref(trip)} className="stats-trip-row">
                <span className="stats-trip-title">{trip.title}</span>
                <span className="stats-trip-meta">
                  {formatDateWithYear(new Date(trip.start), locale)} —{" "}
                  {formatDateWithYear(new Date(trip.end), locale)} · {s.tripDays(trip.days)}
                </span>
              </AppLink>
            ))}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
