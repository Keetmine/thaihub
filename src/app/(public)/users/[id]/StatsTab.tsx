"use client";

import AppLink from "@/components/AppLink";
import { useT } from "@/components/LocaleProvider";
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
  eventsByYear: { year: number; count: number }[];
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
  const s = t.account.stats;
  const maxYear = Math.max(1, ...stats.eventsByYear.map((y) => y.count));

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
          <h2 className="section-heading mb-2">{viewer ? s.visitedMapViewer : s.visitedMap}</h2>
          <div className="mb-4">
            <LocationMapLoader locations={stats.visitedLocationPins} height="20rem" />
          </div>
        </>
      )}
    </div>
  );
}
