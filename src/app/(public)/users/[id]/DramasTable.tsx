"use client";

import DramaStatusSelect from "@/components/DramaStatusSelect";
import EpisodeProgress from "@/components/EpisodeProgress";
import DramaRatingSelect from "@/components/DramaRatingSelect";
import { formatRating } from "@/components/StarRatingInput";
import { useMemo, useState } from "react";
import AppLink from "@/components/AppLink";
import SubTabs from "@/components/SubTabs";
import { useLocale, useT } from "@/components/LocaleProvider";
import { dramaHref } from "@/lib/slugHelpers";
import { dramaTitleForLocale } from "@/lib/dramaLocale";
import { WATCH_STATUS_ORDER, episodeProgress } from "@/lib/watchStatus";
import type { DramaWatchStatusValue } from "@/app/(public)/favorites/actions";
import type { Dict, Locale } from "@/lib/i18n";
import styles from "./dramasTable.module.css";

/** Строка вкладки «Сериалы»: отметка человека + поля сериала, которые
 *  показывает таблица. Всё сериализуемо (никаких Date) — данные
 *  приезжают с серверной страницы профиля в клиентский компонент. */
export type ProfileDramaRow = {
  id: string;
  slug: string | null;
  title: string;
  titleRu: string | null;
  posterUrl: string | null;
  episodes: number | null;
  type: string | null;
  country: string | null;
  year: number | null;
  status: DramaWatchStatusValue;
  episodesWatched: number | null;
  /** Своя оценка 0.5-10 с шагом 0.5 (АА2); null — не оценивал. */
  rating: number | null;
};

type SortKey = "title" | "status" | "type" | "year" | "country" | "rating" | "episodes";
type Sort = { key: SortKey; dir: "asc" | "desc" };

/**
 * Вкладка «Сериалы» в профиле — ТАБЛИЦА с сортируемой шапкой.
 *
 * Владелец просила сортировку «не отдельным фильтром, а как на самой
 * таблице»: клик по названию колонки сортирует по ней, повторный клик
 * разворачивает порядок, у активной колонки — стрелка. Порядок по
 * умолчанию не задан вовсе: строки приходят со страницы «свежие
 * отметки сверху», и это осмысленное начальное состояние.
 *
 * Под-табы по статусам (пилюли `SubTabs`) остались, но первой стоит
 * «Все» — без неё сортировка по колонке «Статус просмотра» не имела бы
 * смысла: внутри пилюли статуса он у всех строк один.
 *
 * Клиентский компонент нужен ровно ради сортировки; словарь и язык
 * берутся хуками, а не пропсами (образец — StatsHero).
 */
export default function DramasTable({
  rows,
  editable = false,
}: {
  rows: ProfileDramaRow[];
  /** Свой профиль: счётчик серий не подпись, а рабочие «−/+» — те же,
   *  что в каталоге и на странице сериала (правка владельца
   *  2026-09-06: отмечать серии из профиля удобнее, чем ходить туда). */
  editable?: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const p = t.social.profile;
  // По умолчанию — по названию (правка владельца 2026-09-06): раньше
  // список шёл в порядке «когда я это последний раз трогала», и найти
  // в нём сериал глазами было нечем. Колонки по-прежнему
  // переключаются кликом.
  const [sort, setSort] = useState<Sort>({ key: "title", dir: "asc" });

  // Порядок названий и переведённых подписей — по правилам языка
  // зрителя: на /ru кириллица иначе встала бы вразнобой (та же логика,
  // что у compareDramaTitles).
  const collator = useMemo(() => new Intl.Collator(locale), [locale]);

  // Одинаковые значения (год, статус) — по названию: без этого строки
  // внутри группы прыгали бы при каждой сортировке.
  const byTitle = (a: ProfileDramaRow, b: ProfileDramaRow) =>
    collator.compare(dramaTitleForLocale(a, locale), dramaTitleForLocale(b, locale));

  const sortRows = (list: ProfileDramaRow[]): ProfileDramaRow[] => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = sortValue(a, sort.key, t, locale);
      const bv = sortValue(b, sort.key, t, locale);
      // Пустые ячейки (у части записей нет типа/страны/года) всегда
      // внизу — и по возрастанию, и по убыванию: иначе разворот
      // порядка показывал бы полтаблицы пустых строк.
      if (av === null && bv === null) return byTitle(a, b);
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : collator.compare(String(av), String(bv));
      return cmp === 0 ? byTitle(a, b) : cmp * dir;
    });
  };

  const toggle = (key: SortKey) =>
    setSort((cur) =>
      cur.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );

  const table = (list: ProfileDramaRow[]) => (
    <div className="mb-4">
      <Head sort={sort} onSort={toggle} t={t} />
      <div className={styles.rows}>
        {sortRows(list).map((row) => (
          <Row key={row.id} row={row} t={t} locale={locale} editable={editable} />
        ))}
      </div>
    </div>
  );

  // Порядок пилюль: сначала статусы (WATCH_STATUS_ORDER начинается со
  // «Смотрю»), «Все» — последней (правка владельца 2026-09-09). Открытая
  // по умолчанию вкладка — первая, то есть «Смотрю»: в свой список ходят
  // отметить серию у того, что смотрят сейчас, а полный перечень — это
  // архив, за которым приходят реже. Если ничего не смотрят, откроется
  // следующий непустой статус, а у совсем пустого списка — «Все».
  const tabs = [
    ...WATCH_STATUS_ORDER.flatMap((status) => {
      const list = rows.filter((r) => r.status === status);
      // Пустые статусы пилюль не получают — как было раньше.
      if (list.length === 0) return [];
      return [
        {
          key: status,
          label: t.catalog.watchStatus[status],
          count: list.length,
          content: table(list),
        },
      ];
    }),
    // «Все» нужна не только для полноты: сортировка по колонке «Статус
    // просмотра» имеет смысл только здесь.
    { key: "all", label: p.dramasTab.allTab, count: rows.length, content: table(rows) },
  ];

  return <SubTabs tabs={tabs} ariaLabel={p.tabs.dramas(rows.length)} />;
}

/** Значение ячейки для сортировки: null — «пусто», такие строки уходят
 *  вниз. Статус сортируется по порядку из WATCH_STATUS_ORDER (смотрю →
 *  просмотрено → в планах → …), а не по алфавиту подписи; тип и страна
 *  — по переведённой подписи, ведь её человек и видит. */
function sortValue(row: ProfileDramaRow, key: SortKey, t: Dict, locale: Locale): string | number | null {
  switch (key) {
    case "title":
      return dramaTitleForLocale(row, locale);
    case "status":
      return WATCH_STATUS_ORDER.indexOf(row.status);
    case "type":
      return row.type ? t.catalog.dramaType(row.type) : null;
    case "year":
      return row.year;
    case "country":
      return row.country ? t.catalog.dramaCountry(row.country) : null;
    case "rating":
      return row.rating;
    case "episodes": {
      // Через episodeProgress — чтобы число совпадало с показанным (у
      // «Просмотрено» пустой счётчик читается как n из n).
      const progress = episodeProgress(row, row.episodes);
      return progress ? progress.watched : null;
    }
  }
}

/** Ряд названий колонок: он же орган управления сортировкой. */
function Head({
  sort,
  onSort,
  t,
}: {
  sort: Sort | null;
  onSort: (key: SortKey) => void;
  t: Dict;
}) {
  // Подписи колонок общие с каталогом /dramas (t.catalog.dramaColumns):
  // таблицы задуманы роднёй, и свой словарь у каждой разъехался бы.
  const c = t.catalog.dramaColumns;
  const button = (key: SortKey, label: string) => {
    const active = sort && sort.key === key ? sort : null;
    return (
      <button
        type="button"
        className={`${styles.sortButton}${active ? ` ${styles.sortActive}` : ""}`}
        onClick={() => onSort(key)}
      >
        {label}
        {active && (
          <span className={styles.sortArrow} aria-hidden>
            {active.dir === "asc" ? "▲" : "▼"}
          </span>
        )}
      </button>
    );
  };
  return (
    <div className={styles.head}>
      <div className={styles.headTitle}>{button("title", c.title)}</div>
      <div className={styles.cols}>
        <span className={styles.colStatus}>{button("status", c.status)}</span>
        <span className={styles.colType}>{button("type", c.type)}</span>
        <span className={styles.colYear}>{button("year", c.year)}</span>
        <span className={styles.colCountry}>{button("country", c.country)}</span>
        <span className={styles.colRating}>{button("rating", c.rating)}</span>
        <span className={styles.colProgress}>{button("episodes", c.episodes)}</span>
      </div>
    </div>
  );
}

/** Строка таблицы — плотность и колонки каталога /dramas: миниатюра +
 *  название слева, статус · тип · год · страна · серии справа. */
function Row({
  row,
  t,
  locale,
  editable,
}: {
  row: ProfileDramaRow;
  t: Dict;
  locale: Locale;
  editable: boolean;
}) {
  const progress = episodeProgress(row, row.episodes);
  const title = dramaTitleForLocale(row, locale);
  return (
    <div className={`surface surface-hover ${styles.row}`}>
      <div className={styles.titleCell}>
        <AppLink href={dramaHref(row)} className={`text-decoration-none ${styles.rowLink}`}>
          <span className={styles.poster} aria-hidden={!row.posterUrl}>
            {row.posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img loading="lazy" decoding="async" src={row.posterUrl} alt="" />
            ) : (
              <span className={`font-display fw-bold ${styles.posterFallback}`} aria-hidden>
                {title.trim().charAt(0).toUpperCase()}
              </span>
            )}
          </span>
          <span className={`font-display fw-medium text-white ${styles.title}`}>{title}</span>
        </AppLink>
      </div>
      <div className={styles.cols}>
        <span className={`${styles.colStatus} table-status-cell`}>
          {/* В своём профиле статус меняется тут же — тем же выпадающим
              списком, что в каталоге (правка владельца 2026-09-06).
              В чужом это просто подпись. */}
          {editable ? (
            <DramaStatusSelect dramaId={row.id} status={row.status} />
          ) : (
            t.catalog.watchStatus[row.status]
          )}
        </span>
        <span className={styles.colType}>{row.type ? t.catalog.dramaType(row.type) : ""}</span>
        <span className={styles.colYear}>{row.year ?? ""}</span>
        <span className={styles.colCountry}>
          {row.country ? t.catalog.dramaCountry(row.country) : ""}
        </span>
        <span className={`${styles.colRating} table-status-cell`}>
          {/* Своя оценка (АА2): в своём профиле её тут же и ставят —
              компактным списком, как статус слева. В чужом — просто
              «★ 9», а у неоценённого пусто: прочерк в каждой второй
              строке зарябил бы. */}
          {editable ? (
            <DramaRatingSelect dramaId={row.id} rating={row.rating} />
          ) : row.rating != null ? (
            `★ ${formatRating(row.rating)}`
          ) : (
            ""
          )}
        </span>
        <span className={styles.colProgress}>
          {/* В своём профиле — рабочий счётчик «− 2/10 +», как в
              каталоге; в чужом просто «2/10»: чужой прогресс не наш. */}
          {editable ? (
            <EpisodeProgress
              dramaId={row.id}
              total={row.episodes}
              watched={progress ? progress.watched : null}
              variant="inline"
            />
          ) : progress ? (
            progress.total !== null ? `${progress.watched}/${progress.total}` : progress.watched
          ) : (
            ""
          )}
        </span>
      </div>
    </div>
  );
}
