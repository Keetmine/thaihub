"use client";

import { useState } from "react";
import AppLink from "@/components/AppLink";
import { useLocale, useT } from "@/components/LocaleProvider";
import { shortMonthNames } from "@/lib/dates";
import LocationMapLoader from "@/components/LocationMapLoader";
import { performerHref } from "@/lib/performerSlug";

// Сериализуемые версии для клиентской вкладки (Д1). Переехали из
// кабинета (/account) вместе с самой вкладкой — профиль теперь единая
// страница и для себя, и для зрителей.
export type StatsForTab = {
  attendedEvents: number;
  upcomingEvents: number;
  // uniqueVenues здесь больше нет — площадки из статистики профиля
  // убраны (правка владельца); метрика ачивок в lib/userStats осталась.
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
  /** Пересмотры: сколько всего и что пересматривали чаще прочего.
   *  Необязательные — свод отдаёт их не всегда, а плитка рисуется только
   *  при ненулевом числе: пустая плитка с нулём — шум (правка
   *  владельца). Название сериала приезжает на обоих языках, выбирает
   *  его сама плитка (dramaTitleForLocale). */
  rewatchTotal?: number;
  mostRewatched?: { title: string; titleRu: string | null; count: number } | null;
  /** Вкусовой профиль (аудит 2026-09, п.6.2): топ-жанры по досмотренному
   *  и «своя средняя против MyDramaList». Необязательные по той же
   *  причине, что пересмотры: пустой блок — шум, рисуемся только когда
   *  есть что сказать (жанров нет / оценок с парой MDL меньше пяти). */
  topGenres?: { genre: string; count: number }[];
  ratingVsMdl?: { own: number; diff: number; count: number } | null;
  trips: number;
  daysInThailand: number;
  friends: number;
  /** `months` — двенадцать чисел, январь нулевой (разбивка внутри года). */
  eventsByYear: { year: number; count: number; months: number[] }[];
};

/**
 * «Статистика» — чистый рендер свода `computeUserStats`: топ артистов,
 * бары по годам, карта посещённого. Кто и что имеет право видеть,
 * решает СТРАНИЦА (свой/чужой, подписка, приватность): сюда приезжают
 * уже отфильтрованные данные — например, зрителю при скрытых
 * «посещённых местах» пины карты не передаются вовсе.
 * Ачивки и списки актёров из вкладки уехали: медали — в левой колонке
 * профиля, списки — во вкладке «Места и списки».
 */
export default function StatsTab({
  stats,
  viewer = false,
}: {
  stats: StatsForTab;
  /** Чужой профиль: заголовок карты без «вы» («Карта посещённых мест»). */
  viewer?: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const s = t.account.stats;
  const maxYear = Math.max(1, ...stats.eventsByYear.map((y) => y.count));
  // По умолчанию раскрыт последний год: он самый интересный, а
  // eventsByYear отсортирован по возрастанию.
  const [activeYear, setActiveYear] = useState<number | null>(
    stats.eventsByYear.length > 0
      ? stats.eventsByYear[stats.eventsByYear.length - 1].year
      : null,
  );
  const activeMonths =
    stats.eventsByYear.find((y) => y.year === activeYear)?.months ?? null;
  const maxMonth = Math.max(1, ...(activeMonths ?? [1]));
  const monthNames = shortMonthNames(locale);

  const topGenres = stats.topGenres ?? [];
  const vsMdl = stats.ratingVsMdl;
  // Знак diff читается словом: минус — строже MyDramaList, плюс —
  // щедрее, ноль после округления — вровень. Само число показываем без
  // знака, знак уже в слове.
  const vsMdlLine = vsMdl
    ? (viewer ? s.tasteAvgViewer : s.tasteAvgSelf)(vsMdl.own.toFixed(1)) +
      (vsMdl.diff < 0
        ? s.tasteStricter(Math.abs(vsMdl.diff).toFixed(1))
        : vsMdl.diff > 0
          ? s.tasteKinder(vsMdl.diff.toFixed(1))
          : s.tasteSame)
    : null;

  return (
    <div>
      {/* Вкусовой профиль (п.6.2): жанры — теми же чипами, что артисты
          ниже; ссылки ведут в поиск с фильтром жанра, как чипы жанров на
          странице сериала. Значения не переводятся — данные каталога. */}
      {(topGenres.length > 0 || vsMdlLine) && (
        <>
          <h2 className="section-heading mb-2">{s.tasteTitle}</h2>
          {topGenres.length > 0 && (
            <div className={`d-flex flex-wrap gap-2 ${vsMdlLine ? "mb-2" : "mb-4"}`}>
              {topGenres.map((g) => (
                <AppLink
                  key={g.genre}
                  href={`/search?section=dramas&genres=${encodeURIComponent(g.genre)}`}
                  className="surface surface-hover text-decoration-none d-flex align-items-center gap-2 p-2 pe-3"
                >
                  <span className="small text-white">{g.genre}</span>
                  <span className="small text-secondary">×{g.count}</span>
                </AppLink>
              ))}
            </div>
          )}
          {vsMdlLine && <p className="small text-secondary mb-4">{vsMdlLine}</p>}
        </>
      )}

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

      {stats.eventsByYear.length > 0 && (
        <>
          <h2 className="section-heading mb-2">{s.byYear}</h2>
          {/* Год — переключатель (правка владельца 2026-09-10): под
              рядом лет раскрывается разбивка выбранного года по
              месяцам. Двенадцать столбиков на КАЖДЫЙ год сразу дали бы
              шестьдесят полосок в блоке размером с ладонь. */}
          <div className="d-flex align-items-end gap-3 mb-3" style={{ height: "6rem" }}>
            {stats.eventsByYear.map((y) => {
              const active = y.year === activeYear;
              return (
                <button
                  key={y.year}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setActiveYear(y.year)}
                  className="stats-year-bar text-center d-flex flex-column justify-content-end"
                  style={{ height: "100%" }}
                >
                  <span className="small text-secondary d-block">{y.count}</span>
                  <div
                    className="mx-auto"
                    style={{
                      width: "2rem",
                      height: `${Math.max(8, (y.count / maxYear) * 60)}px`,
                      background: "var(--bs-primary)",
                      borderRadius: "0.3rem 0.3rem 0 0",
                      opacity: active ? 1 : 0.45,
                    }}
                  />
                  <span
                    className={`small d-block ${active ? "text-white" : "text-secondary"}`}
                  >
                    {y.year}
                  </span>
                </button>
              );
            })}
          </div>

          {activeMonths && (
            <div className="mb-4">
              <p className="small text-secondary mb-2">{s.byMonth(activeYear!)}</p>
              {/* Прокрутка, а не сжатие: на 390px двенадцать колонок
                  ужимались до 23px, и «Янв» превращалось в «Ян…».
                  Столбик не уже 2.25rem, ряд едет вбок общим тонким
                  скроллом — как ряды постеров. */}
              <div
                className="d-flex align-items-end gap-2 thin-scroll"
                style={{ height: "5.5rem", overflowX: "auto" }}
              >
                {activeMonths.map((count, i) => (
                  <div
                    key={i}
                    className="text-center d-flex flex-column justify-content-end"
                    style={{ height: "100%", flex: "1 0 auto", minWidth: "2.25rem" }}
                    title={`${monthNames[i]}: ${count}`}
                  >
                    {/* Ноль подписью не рисуем: двенадцать нулей под
                        пустыми столбиками — шум, а не данные. */}
                    <span className="small text-secondary d-block">
                      {count > 0 ? count : "\u00a0"}
                    </span>
                    <div
                      style={{
                        height: `${count > 0 ? Math.max(6, (count / maxMonth) * 40) : 2}px`,
                        background: "var(--bs-primary)",
                        borderRadius: "0.2rem 0.2rem 0 0",
                        opacity: count > 0 ? 0.85 : 0.25,
                      }}
                    />
                    <span
                      className="text-secondary d-block text-truncate"
                      style={{ fontSize: "0.7rem" }}
                    >
                      {monthNames[i]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {stats.visitedLocationPins.length > 0 && (
        <>
          <h2 className="section-heading mb-2">{viewer ? s.visitedMapViewer : s.visitedMap}</h2>
          <div className="mb-4">
            <LocationMapLoader locations={stats.visitedLocationPins} height="20rem" />
          </div>
        </>
      )}
    </div>
  );
}
