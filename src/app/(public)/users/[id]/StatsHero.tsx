"use client";

import { useState } from "react";
import AppLink from "@/components/AppLink";
import type { StatsForTab } from "./StatsTab";
import { useLocale, useT } from "@/components/LocaleProvider";
import { formatDateWithYear } from "@/lib/dates";
import { dramaTitleForLocale } from "@/lib/dramaLocale";
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

  // Пересмотры — той же плиткой и только когда они есть: у большинства
  // их нет вовсе, а плитка с нулём ничего не сообщает (правка
  // владельца). Подпись — что пересматривали чаще прочего.
  if (stats.rewatchTotal) {
    heroes.push({
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
      {/* Полоса счётчиков, а не четыре плитки-коробки (правка владельца
          2026-09-17, вторая по счёту: «всё ещё не нравятся плитки»).
          Одна поверхность, счётчики через тонкие разделители — число,
          подпись, подсказка. Подробности и так лежат в карточках ниже,
          верхней полосе незачем быть тяжёлой. Разделители — щели грида
          на фоне цвета рамки: они сами встают и между колонками, и
          между рядами, когда на телефоне полоса складывается в 2×2. */}
      <div className="stats-strip mb-3">
        {heroes.map((h) => {
          const inner = (
            <>
              <span className="stats-strip-value">{h.value}</span>
              <span className="stats-strip-label">
                <span aria-hidden>{h.icon}</span> {h.label}
              </span>
              <span className="stats-strip-hint">
                {h.hint}
                {h.expandKey && (
                  <span className="stats-strip-chevron" aria-hidden>
                    ▾
                  </span>
                )}
              </span>
            </>
          );
          return h.expandKey ? (
            <button
              key={h.label}
              type="button"
              className={`stats-strip-item stats-strip-toggle${expanded === h.expandKey ? " is-open" : ""}`}
              aria-expanded={expanded === h.expandKey}
              onClick={() => setExpanded((cur) => (cur === h.expandKey ? null : h.expandKey!))}
            >
              {inner}
            </button>
          ) : (
            <div key={h.label} className="stats-strip-item">
              {inner}
            </div>
          );
        })}
      </div>

      {/* Раскрытые панели (переделка 2026-09-17). События — строками с
          постером, названием, площадкой и датой, свежие сверху; артисты
          — сеткой круглых фото с именем под ними, как ряд друзей в
          профиле. Обе панели ограничены по высоте и прокручиваются
          внутри (правка владельца: «если будет 20–40 событий, оно будет
          занимать всю страницу»). Порядок артистов — по пейрингам, как
          везде на витрине; его задаёт свод. */}
      {expanded === "events" && (
        <div className="surface p-3 mb-3 hero-expand thin-scroll">
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
      )}
      {expanded === "artists" && (
        <div className="surface p-3 mb-3 hero-expand thin-scroll">
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
      )}
    </div>
  );
}
