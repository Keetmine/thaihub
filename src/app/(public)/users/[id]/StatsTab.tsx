"use client";

import AppLink from "@/components/AppLink";
import { useLocale, useT } from "@/components/LocaleProvider";
import { shortMonthNames } from "@/lib/dates";
import LocationMapLoader from "@/components/LocationMapLoader";
import { performerHref } from "@/lib/performerSlug";
import { WATCH_STATUS_KEYS, type WatchStatusKey } from "@/lib/watchStatuses";
import { dramaHref, locationHref } from "@/lib/slugHelpers";
import { dramaTitleForLocale } from "@/lib/dramaLocale";

// Сериализуемые версии для клиентской вкладки (Д1). Переехали из
// кабинета (/account) вместе с самой вкладкой — профиль теперь единая
// страница и для себя, и для зрителей.
export type StatsForTab = {
  attendedEvents: number;
  upcomingEvents: number;
  // uniqueVenues здесь больше нет — площадки из статистики профиля
  // убраны (правка владельца); метрика ачивок в lib/userStats осталась.
  performersSeenLive: number;
  /** Списки под кликабельными цифрами: какие события посещены и кого
   *  видели вживую (дата — ISO-строкой, серверная сериализация). */
  attendedEventsList: {
    id: string;
    slug: string | null;
    title: string;
    date: string;
    posterUrl: string | null;
    venue: string;
  }[];
  seenPerformers: { id: string; name: string; slug: string | null; photoUrl: string | null }[];
  /** Группы и маскоты — свои счётчики рядом с артистами (правка
   *  владельца 2026-09-23). */
  bandsSeenLive: number;
  seenBands: { id: string; name: string; slug: string | null; photoUrl: string | null }[];
  mascotsSeenLive: number;
  seenMascots: { id: string; name: string; slug: string | null; photoUrl: string | null }[];
  topPerformers: { id: string; name: string; slug: string | null; photoUrl: string | null; count: number }[];
  visitedLocations: number;
  visitedLocationPins: { id: string; name: string; latitude: number; longitude: number }[];
  /** Список рядом с картой: фото, название, из какого сериала. */
  visitedPlaces: {
    id: string;
    slug: string | null;
    name: string;
    photoUrl: string | null;
    dramas: { id: string; slug: string | null; title: string; titleRu: string | null }[];
  }[];
  completedDramas: number;
  /** Сколько сериалов в каждом статусе — полоса библиотеки. */
  watchByStatus: Record<WatchStatusKey, number>;
  episodesWatched: number;
  hoursWatched: number;
  /** Пересмотры: сколько всего и что пересматривали чаще прочего.
   *  Необязательные — свод отдаёт их не всегда, а строка рисуется только
   *  при ненулевом числе: пустая строка с нулём — шум (правка
   *  владельца). Название сериала приезжает на обоих языках, выбирает
   *  его сама вкладка (dramaTitleForLocale). */
  rewatchTotal?: number;
  mostRewatched?: { title: string; titleRu: string | null; count: number } | null;
  /** Топ-жанры по досмотренному. Необязательные по той же причине, что
   *  пересмотры: пустой блок — шум. Сравнение своей средней оценки с
   *  MyDramaList убрано с сайта целиком (правка владельца 2026-09-17). */
  topGenres?: { genre: string; count: number }[];
  trips: number;
  /** Поездки списком под цифрой — только у владельца профиля. */
  tripsList: { id: string; slug: string | null; title: string; start: string; end: string; days: number }[];
  daysInThailand: number;
  friends: number;
  /** `months` — двенадцать чисел, январь нулевой (разбивка внутри года). */
  eventsByYear: { year: number; count: number; months: number[] }[];
};

/** Альфа сегмента по статусу: порядок «смотрю → просмотрено → буду →
 *  отложено → заброшено», яркость падает по нему же. Один акцентный
 *  цвет на пять сегментов — палитра сайта одноцветная, второй цвет
 *  на полосе выглядел бы чужим. */
const STATUS_ALPHA: Record<WatchStatusKey, number> = {
  WATCHING: 1,
  COMPLETED: 0.72,
  PLAN_TO_WATCH: 0.48,
  ON_HOLD: 0.3,
  DROPPED: 0.16,
};

/**
 * «Статистика» — чистый рендер свода `computeUserStats` сеткой карточек
 * (переделка 2026-09-17): «Вживую» (рейтинг артистов, календарь
 * событий), «Сериалы» (библиотека по статусам, жанры) и карта
 * посещённого со списком мест. Счётчики (события, артисты, дни в
 * поездках, сериалы) — плитками над карточками, см. StatsHero.tsx: там
 * же раскрываются списки. Кто и что имеет право видеть, решает СТРАНИЦА
 * (свой/чужой, подписка, приватность): сюда приезжают уже
 * отфильтрованные данные — например, зрителю при скрытых «посещённых
 * местах» пины карты не передаются вовсе, а список поездок отдаётся
 * только владельцу.
 *
 * Календарь — тепловая полоса «год × месяц», а не столбики с
 * переключателем года: при одном-двух годах столбики читались
 * сломанным виджетом, а двенадцать полосок месяца были почти все
 * пустые. Полоса одинаково выглядит для одного года и для десяти и не
 * требует кликов.
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
  const monthNames = shortMonthNames(locale);

  // ---- Вживую ----
  // Календарь считает афишу И встречи сообществ (правка владельца
  // 2026-09-17); цифра «событий вживую» — афишная, там же и список.
  const years = stats.eventsByYear;
  const calendarTotal = years.reduce((sum, y) => sum + y.count, 0);
  // Интенсивность — от самого насыщенного месяца ЗА ВСЕ годы: иначе два
  // события в тихом году светились бы так же, как восемь в громком.
  const maxMonth = Math.max(1, ...years.flatMap((y) => y.months));
  const topRank = stats.topPerformers.slice(0, 5);
  const maxRank = Math.max(1, ...topRank.map((p) => p.count));
  // Не было ни одного события — ни афишного, ни встречи — календаря нет;
  // нет и увиденных артистов — нет всей карточки.
  const showCalendar = calendarTotal > 0;
  const showLive = showCalendar || topRank.length > 0;

  // ---- Сериалы ----
  const libraryTotal = WATCH_STATUS_KEYS.reduce((sum, k) => sum + stats.watchByStatus[k], 0);
  const topGenres = stats.topGenres ?? [];
  const showSeries = libraryTotal > 0;

  const showMap = stats.visitedLocationPins.length > 0;

  if (!showLive && !showSeries && !showMap) return null;

  return (
    <div className="row g-3">
      {showLive && (
        <div className={showSeries ? "col-12 col-lg-7" : "col-12"}>
          <div className="surface stats-card">
            <div className="stats-card-head">
              <h2 className="section-heading">{s.liveTitle}</h2>
              <span className="stats-card-meta">
                {s.yearTotal(calendarTotal)} · {s.artistsCount(stats.performersSeenLive)}
              </span>
            </div>

            {topRank.length > 0 && (
              <>
                <p className="small text-secondary mb-2">{s.topPerformers}</p>
                <div className={`stats-rank ${showCalendar ? "mb-4" : ""}`}>
                  {topRank.map((p) => (
                    <AppLink key={p.id} href={performerHref(p)} className="stats-rank-row">
                      {p.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          loading="lazy"
                          decoding="async"
                          src={p.photoUrl}
                          alt=""
                          className="stats-rank-photo"
                        />
                      ) : (
                        <span className="stats-rank-photo" />
                      )}
                      <span className="stats-rank-name">{p.name}</span>
                      <span className="stats-rank-count">×{p.count}</span>
                      <span className="stats-rank-bar">
                        <span style={{ width: `${(p.count / maxRank) * 100}%` }} />
                      </span>
                    </AppLink>
                  ))}
                </div>
              </>
            )}

            {showCalendar && (
              <>
                <p className="small text-secondary mb-2">{s.calendarTitle}</p>
                <div className="stats-heat">
                  <div className="stats-heat-row stats-heat-months" aria-hidden>
                    <span />
                    {monthNames.map((m) => (
                      <span key={m}>{m}</span>
                    ))}
                    <span />
                  </div>
                  {years.map((y) => (
                    <div key={y.year} className="stats-heat-row">
                      <span className="stats-heat-year">{y.year}</span>
                      {y.months.map((count, i) => (
                        <span
                          key={i}
                          className={`stats-heat-cell${count === 0 ? " is-empty" : ""}`}
                          style={{ "--heat": count / maxMonth } as React.CSSProperties}
                          title={s.monthTitle(monthNames[i], y.year, count)}
                        />
                      ))}
                      <span className="stats-heat-total">{s.yearTotal(y.count)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showSeries && (
        <div className={showLive ? "col-12 col-lg-5" : "col-12"}>
          <div className="surface stats-card">
            <div className="stats-card-head">
              <h2 className="section-heading">{s.seriesTitle}</h2>
              <span className="stats-card-meta">{s.libraryLead(libraryTotal)}</span>
            </div>

            {/* «Досмотрено» переехало сюда из плиток над статистикой
                (правка владельца 2026-09-23: «блок „сериала досмотрено“
                давай перенесём в раздел с сериалами»). В ряду плиток оно
                стояло среди счётчиков «вживую», хотя рассказывает про
                библиотеку — а здесь у него рядом и полоса статусов, и
                жанры. */}
            <p className="stats-figure">
              <b>{stats.completedDramas}</b> {s.completedLabel}
              {stats.episodesWatched > 0 && (
                <span className="text-secondary">
                  {" · "}
                  {s.episodesHours(stats.episodesWatched, stats.hoursWatched)}
                </span>
              )}
            </p>

            {/* Полоса библиотеки: пять сегментов по статусам, ширина —
                доля от всех отметок. Нулевые статусы не рисуются ни на
                полосе, ни в легенде. */}
            <div className="stats-library" role="img" aria-label={s.libraryLead(libraryTotal)}>
              {WATCH_STATUS_KEYS.filter((k) => stats.watchByStatus[k] > 0).map((k) => (
                <span
                  key={k}
                  style={
                    {
                      flex: `${stats.watchByStatus[k]} 1 0`,
                      "--alpha": STATUS_ALPHA[k],
                    } as React.CSSProperties
                  }
                />
              ))}
            </div>
            <div className="stats-legend">
              {WATCH_STATUS_KEYS.filter((k) => stats.watchByStatus[k] > 0).map((k) => (
                <span key={k}>
                  <span
                    className="stats-legend-dot"
                    style={{ "--alpha": STATUS_ALPHA[k] } as React.CSSProperties}
                  />
                  {t.catalog.watchStatus[k]} <b>{stats.watchByStatus[k]}</b>
                </span>
              ))}
            </div>

            {topGenres.length > 0 && (
              <>
                <p className="small text-secondary mt-3 mb-2">{s.genresLead}</p>
                {/* Ссылки ведут в поиск с фильтром жанра, как чипы жанров
                    на странице сериала. Значения не переводятся — данные
                    каталога. */}
                <div className="stats-genres">
                  {topGenres.map((g) => (
                    <AppLink
                      key={g.genre}
                      href={`/search?section=dramas&genres=${encodeURIComponent(g.genre)}`}
                      className="stats-genre"
                    >
                      {g.genre} <small>×{g.count}</small>
                    </AppLink>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showMap && (
        <div className="col-12">
          <div className="surface stats-card">
            <div className="stats-card-head">
              <h2 className="section-heading">{viewer ? s.visitedMapViewer : s.visitedMap}</h2>
              <span className="stats-card-meta">{s.visitedCount(stats.visitedLocationPins.length)}</span>
            </div>
            {/* Карта слева, список мест справа (правка владельца
                2026-09-17): фото, название и из какого сериала. Список
                прокручивается внутри своей высоты, чтобы карточка не
                росла с каждым новым местом; на телефоне встаёт под
                карту. */}
            <div className="stats-map-grid">
              <LocationMapLoader locations={stats.visitedLocationPins} height="18rem" />
              <ul className="stats-places list-unstyled mb-0 thin-scroll">
                {stats.visitedPlaces.map((pl) => (
                  <li key={pl.id} className="stats-place">
                    <AppLink href={locationHref(pl)} className="stats-place-photo-link">
                      {pl.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          loading="lazy"
                          decoding="async"
                          src={pl.photoUrl}
                          alt=""
                          className="stats-place-photo"
                        />
                      ) : (
                        <span className="stats-place-photo stats-place-fallback">
                          {pl.name.slice(0, 1)}
                        </span>
                      )}
                    </AppLink>
                    <div className="stats-place-body">
                      <AppLink href={locationHref(pl)} className="stats-place-name">
                        {pl.name}
                      </AppLink>
                      {pl.dramas.length > 0 && (
                        <span className="stats-place-drama">
                          {pl.dramas.map((d, i) => (
                            <span key={d.id}>
                              {i > 0 && " · "}
                              <AppLink href={dramaHref(d)}>{dramaTitleForLocale(d, locale)}</AppLink>
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
