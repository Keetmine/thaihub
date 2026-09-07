import UploadImage from "@/components/UploadImage";
import AppLink from "@/components/AppLink";
import { CalendarIcon } from "@/components/icons";
import PageHeader, { WATERMARK_NAME_LIMIT } from "@/components/PageHeader";
import { prisma } from "@/lib/prisma";
import NameSearchBox from "@/components/NameSearchBox";
// Собирает адрес от текущих параметров страницы (назван по месту
// рождения — админским спискам, но логика общая): сортировка не должна
// терять ни поиск, ни вкладку статуса.
import { adminListHref } from "@/lib/adminListHref";
import DramaStatusSelect from "@/components/DramaStatusSelect";
import EpisodeProgress from "@/components/EpisodeProgress";
import DramaRatingSelect from "@/components/DramaRatingSelect";
import { combineScores, fetchSiteScores } from "@/lib/dramaRating";
import { episodeProgress } from "@/lib/watchStatus";
import { getCurrentUser } from "@/lib/userAuth";
import { WATCH_STATUS_ORDER } from "@/lib/watchStatus";
import { getDramaWatchStatuses } from "@/lib/favorites";
import type { DramaWatchStatusValue } from "../favorites/actions";
import { SEARCH_RESULT_LIMIT } from "@/lib/pagination";
import { dramaHref } from "@/lib/dramaSlug";
import { dramaTitleForLocale } from "@/lib/dramaLocale";
import { dramaTitleWhere } from "@/lib/searchWhere";
import { pageMetadata } from "@/lib/seo";
import { getT } from "@/lib/i18n";
import { unstable_cache } from "next/cache";
import { CATALOG_TAG } from "@/lib/catalogCache";
import { CATALOG_LETTERS, isCatalogLetter, letterPrefixes } from "@/lib/catalogLetters";
import styles from "./dramas.module.css";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ letter?: string }>;
}) {
  const { t } = await getT();
  const { letter } = await searchParams;
  // С-5: у страницы буквы canonical самоссылающийся — иначе поисковик
  // склеил бы все буквы в одну страницу.
  return pageMetadata({
    title: t.catalog.dramas.metaTitle,
    description: t.catalog.dramas.metaDescription,
    path: isCatalogLetter(letter) ? `/dramas?letter=${encodeURIComponent(letter)}` : "/dramas",
  });
}


export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------
 * Кэш общих выборок (П-1): гостевой список и подложка имён одинаковы
 * для всех — считаем раз в полчаса (тег catalog сбрасывает раньше).
 * Списки залогиненных (по статусам просмотра) остаются живыми.
 * ------------------------------------------------------------------ */

/** Поля строки каталога — полная запись Drama тянет синопсисы и даты,
 *  которые список не показывает. */
const DRAMA_ROW_SELECT = {
  id: true,
  slug: true,
  title: true,
  titleRu: true,
  posterUrl: true,
  year: true,
  episodes: true,
  // Табличные колонки строки (правка владельца 2026-09-05): тип,
  // страна; статус — для бейджа «Выходит» у названия.
  type: true,
  country: true,
  // Сводная оценка в строке (см. dramaRating.ts) — половина от MDL.
  mdlScore: true,
  status: true,
} as const;

/** Гостевой список без поиска: свежие по дате эфира. */
const getGuestDramas = unstable_cache(
  async () =>
    prisma.drama.findMany({
      where: { airedFrom: { not: null } },
      select: DRAMA_ROW_SELECT,
      orderBy: { airedFrom: "desc" },
      take: 60,
    }),
  // v2: ключ сменён вместе с составом полей (тип/страна/статус в
  // строке) — иначе до истечения кэша строки шли без новых колонок.
  ["dramas-guest-list-v2"],
  { revalidate: 1800, tags: [CATALOG_TAG] },
);

const getDramasWatermarkNames = unstable_cache(
  async () =>
    (
      await prisma.drama.findMany({
        select: { title: true },
        // Вторым ключом — свежесть эфира: хвост подложки лучше набрать
        // недавними сериалами, чем алфавитом с начала каталога.
        orderBy: [
          { watchStatuses: { _count: "desc" } },
          { airedFrom: { sort: "desc", nulls: "last" } },
        ],
        take: WATERMARK_NAME_LIMIT,
      })
    ).map((d) => d.title),
  ["dramas-watermark-names"],
  { revalidate: 1800, tags: [CATALOG_TAG] },
);

/** С-5: полный список буквы для серверной страницы `?letter=X`. */
const getDramasByLetter = unstable_cache(
  async (letter: string) =>
    prisma.drama.findMany({
      where: {
        OR: letterPrefixes(letter).map((p) => ({
          title: { startsWith: p, mode: "insensitive" as const },
        })),
      },
      select: { id: true, slug: true, title: true, titleRu: true, year: true },
      orderBy: { title: "asc" },
    }),
  ["dramas-by-letter"],
  { revalidate: 1800, tags: [CATALOG_TAG] },
);

/** Колонки таблицы, по которым можно сортировать. Ключ уезжает в адрес
 *  (`?sort=year&dir=desc`) — сортировка серверная, как и сам список:
 *  ссылка-колонка работает без JS и переживает перезагрузку. */
const SORT_KEYS = ["title", "status", "type", "year", "country", "rating", "episodes"] as const;
type SortKey = (typeof SORT_KEYS)[number];

export default async function DramasPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    letter?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const sp = await searchParams;
  const { q: rawQ, status: rawStatus, letter: rawLetter, sort: rawSort, dir: rawDir } = sp;
  const q = (rawQ ?? "").trim();
  const sortKey = SORT_KEYS.includes(rawSort as SortKey) ? (rawSort as SortKey) : null;
  const sortDir: "asc" | "desc" = rawDir === "desc" ? "desc" : "asc";

  // С-5: серверная страница буквы — полный список сериалов на букву
  // обычными ссылками, для краулера (буквы рейки ведут сюда по href;
  // живой зритель по-прежнему скроллит клиентский список).
  if (!q && isCatalogLetter(rawLetter)) {
    const { t: lt, locale: lLocale } = await getT();
    const dramasOfLetter = await getDramasByLetter(rawLetter);
    return (
      <div>
        <PageHeader
          eyebrow={lt.catalog.eyebrow}
          title={`${lt.catalog.dramas.title} — ${lt.catalog.letterTitle(rawLetter)}`}
        />
        <nav
          className="d-flex flex-wrap align-items-center gap-2 small mb-4"
          aria-label={lt.catalog.letterIndex}
        >
          <span className="text-secondary">{lt.catalog.letterAll}</span>
          {CATALOG_LETTERS.map((l) => (
            <AppLink
              key={l}
              href={`/dramas?letter=${encodeURIComponent(l)}`}
              className={l === rawLetter ? "fw-bold" : undefined}
            >
              {l}
            </AppLink>
          ))}
        </nav>
        <p className="mb-3">
          <AppLink href="/dramas">{lt.catalog.letterBack}</AppLink>
        </p>
        {dramasOfLetter.length === 0 ? (
          <p className="text-secondary">{lt.common.nothingFound}</p>
        ) : (
          <ul className="list-unstyled d-flex flex-column gap-2 mb-0">
            {dramasOfLetter.map((d) => (
              <li key={d.id}>
                <AppLink href={dramaHref(d)}>{dramaTitleForLocale(d, lLocale)}</AppLink>
                {d.year && <span className="small text-secondary"> · {d.year}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  // Ж5: поисковый запрос всегда ищет по всему каталогу — вкладка
  // статуса на время поиска сбрасывается на «Все». Раньше запрос и
  // вкладка комбинировались, и поиск «внутри вкладки» выглядел как
  // сломанный (нашлось 0, хотя сериал в каталоге есть).
  const status =
    !q && WATCH_STATUS_ORDER.includes(rawStatus as DramaWatchStatusValue)
      ? (rawStatus as DramaWatchStatusValue)
      : null;

  const { t, locale } = await getT();
  const currentUser = await getCurrentUser();

  // The catalog has grown into the thousands of dramas — loading and
  // rendering all of them by default made the page painfully slow.
  // Without a search term, show only dramas already marked with some
  // watch status; the full catalog is reachable through search instead
  // of one giant always-rendered list.
  const searchResults = q
    ? await prisma.drama.findMany({
        where: dramaTitleWhere(q),
        orderBy: { title: "asc" },
        take: SEARCH_RESULT_LIMIT,
      })
    : null;

  const dramas = searchResults
    ? searchResults.slice(0, SEARCH_RESULT_LIMIT)
    : currentUser
      ? await prisma.drama.findMany({
          where: {
            watchStatuses: {
              some: status ? { userId: currentUser.id, status } : { userId: currentUser.id },
            },
          },
          orderBy: { title: "asc" },
        })
      : // Анониму (каталог открыт для SEO) — свежие по дате эфира, а не
        // пустой список «ваших статусов». Список общий — из кэша.
        await getGuestDramas();

  const statusByDramaId = await getDramaWatchStatuses(
    dramas.map((d) => d.id),
    currentUser?.id,
  );

  // Оценка бейджем в строке каталога — сводная: наши оценки (звёздочки
  // и публичные отзывы, один человек — один голос) в среднем с
  // MyDramaList. Та же логика, что на странице сериала, см.
  // src/lib/dramaRating.ts.
  const siteScores = await fetchSiteScores(dramas.map((d) => d.id));
  const scoreByDramaId = new Map(
    dramas.map((d) => [
      d.id,
      combineScores(siteScores.get(d.id)?.site ?? null, d.mdlScore),
    ]),
  );

  // Названия за шапкой — самые популярные сериалы по числу отметок
  // статуса просмотра (единственный «мой» сигнал у сериала, сердечка у
  // него нет). Популярность одна на всех — из кэша.
  const watermarkNames = await getDramasWatermarkNames();

  // ---------- сортировка по колонке таблицы ----------
  //
  // Считаем в JS, а не в запросе: две колонки из шести — «мои» (статус
  // просмотра и просмотренные серии), они живут в отдельной таблице и
  // приезжают картой statusByDramaId. Список тут в сотни строк, не в
  // тысячи (гостю — свежие 60, своему — только отмеченные, поиску —
  // предел выдачи), так что сортировка памяти стоит копейки.
  const collator = new Intl.Collator(locale);
  const sortValue = (d: (typeof dramas)[number]): string | number | null => {
    const entry = statusByDramaId.get(d.id) ?? null;
    switch (sortKey) {
      case "title":
        return dramaTitleForLocale(d, locale);
      case "status":
        // По порядку из WATCH_STATUS_ORDER (смотрю → просмотрено → …),
        // а не по алфавиту подписи; без отметки — пусто, вниз.
        return entry ? WATCH_STATUS_ORDER.indexOf(entry.status) : null;
      case "type":
        return d.type ? t.catalog.dramaType(d.type) : null;
      case "year":
        return d.year;
      case "country":
        return d.country ? t.catalog.dramaCountry(d.country) : null;
      case "rating":
        // По СВОЕЙ оценке: колонка про неё, а сводная стоит у названия.
        return entry?.rating ?? null;
      case "episodes":
        return episodeProgress(entry, d.episodes)?.watched ?? null;
      default:
        return null;
    }
  };
  const sortedDramas = sortKey
    ? [...dramas].sort((a, b) => {
        const av = sortValue(a);
        const bv = sortValue(b);
        const byTitle = () =>
          collator.compare(dramaTitleForLocale(a, locale), dramaTitleForLocale(b, locale));
        // Пустые ячейки всегда внизу — и по возрастанию, и по убыванию:
        // иначе разворот показывал бы полтаблицы пустых строк (то же
        // правило, что в таблице профиля).
        if (av === null && bv === null) return byTitle();
        if (av === null) return 1;
        if (bv === null) return -1;
        const cmp =
          typeof av === "number" && typeof bv === "number"
            ? av - bv
            : collator.compare(String(av), String(bv));
        return cmp === 0 ? byTitle() : cmp * (sortDir === "asc" ? 1 : -1);
      })
    : dramas;

  /** Адрес колонки-заголовка. Цикл из трёх состояний: по возрастанию →
   *  по убыванию → без сортировки (обратно к алфавитному списку с
   *  буквами в жёлобе). Адрес собирается от ТЕКУЩИХ параметров, поэтому
   *  поиск и вкладка статуса не теряются. */
  const sortHref = (key: SortKey) =>
    adminListHref(
      "/dramas",
      sp,
      sortKey !== key
        ? { sort: key, dir: null }
        : sortDir === "asc"
          ? { sort: key, dir: "desc" }
          : { sort: null, dir: null },
    );

  // Класс колонки — тот же, что у ячейки строки: подпись встаёт в свою
  // колонку сетки, а на узком экране прячется тем же правилом, что и
  // сама колонка (иначе пять подписей сложились бы столбиком).
  const HEAD_COLUMN_CLASS: Record<SortKey, string> = {
    title: "",
    status: styles.colStatus,
    type: styles.colType,
    year: styles.colYear,
    country: styles.colCountry,
    rating: styles.colRating,
    episodes: styles.colProgress,
  };

  const columnHead = (key: SortKey) => (
    <AppLink
      key={key}
      href={sortHref(key)}
      prefetch={false}
      className={`${styles.headCell} ${HEAD_COLUMN_CLASS[key]} ${
        sortKey === key ? styles.headCellActive : ""
      }`}
    >
      {t.catalog.dramaColumns[key]}
      {sortKey === key && <span aria-hidden> {sortDir === "asc" ? "▲" : "▼"}</span>}
    </AppLink>
  );


  return (
    <div>
      <PageHeader
        eyebrow={t.catalog.eyebrow}
        title={t.catalog.dramas.title}
        size="lg"
        gapOnTitle
        watermark="Series"
        watermarkNames={watermarkNames}
        action={
          // Подпись про наполнение списка — как на актёрах. Условий два,
          // и оба про правдивость: в результатах поиска виден весь
          // каталог, а гостю без входа показываются свежие премьеры, а не
          // «его» сериалы — и в обоих случаях подпись врала бы.
          !q && currentUser ? (
            <div className="hero-note">
              {/* Три абзаца, а не два: перенос первой реплики прибит
                  разметкой — так в макете владельца. */}
              <p className="hero-note-lead">{t.catalog.dramas.heroLead1}</p>
              <p className="hero-note-lead">{t.catalog.dramas.heroLead2}</p>
              <p className="hero-note-cta">{t.catalog.dramas.heroCta}</p>
            </div>
          ) : undefined
        }
      />

      <div className="tab-bar-row">
        <div className="tab-bar">
          <AppLink
            href={`/dramas?${q ? `q=${encodeURIComponent(q)}` : ""}`}
            prefetch={false}
            className={`tab-bar-item ${!status ? "active" : ""}`}
          >
            {t.catalog.all}
          </AppLink>
          {currentUser && WATCH_STATUS_ORDER.map((s) => (
            <AppLink
              key={s}
              href={`/dramas?status=${s}`}
              prefetch={false}
              className={`tab-bar-item ${status === s ? "active" : ""}`}
            >
              {t.catalog.watchStatus[s]}
            </AppLink>
          ))}
        </div>
        {/* И10: из каталога сериалов в их расписание раньше было не
            попасть — иконка ведёт на вкладку «Сериалы» календаря.
            Календарь и поиск — одной группой у правого края: врозь
            space-between ронял иконку в центр ряда (жалоба владельца —
            она должна стоять чуть левее поиска). */}
        <div className="d-flex align-items-center gap-2 flex-shrink-0">
          <AppLink
            href="/calendar?view=series"
            className="btn btn-ghost btn-sm flex-shrink-0"
            aria-label={t.catalog.dramas.calendarLink}
            title={t.catalog.dramas.calendarLink}
          >
            <CalendarIcon />
          </AppLink>
          <NameSearchBox
            action="/dramas"
            q={q}
            placeholder={t.catalog.searchByTitle}
            className=""
          />
        </div>
      </div>

      {/* Список строками, а не постерная сетка: сериалов много одиночных,
          карточки съедали место, а длинные названия обрезались. Строка
          «аля таблица» (правка владельца 2026-09-05): миниатюра постера,
          название (без года — он ушёл в свою колонку; у выходящих —
          бейдж «Выходит»), справа колонки статус просмотра · тип · год ·
          страна · прогресс «2/10». Прогресс-бара в списке больше нет.
          Геометрия — в dramas.module.css, там же уплотнение рейки.
          Буквы-разделители — не над группами, а в левом жёлобе: тихая
          литера на уровне первой строки группы, список визуально
          сплошной (на мобиле — маленькая строка-метка). */}

      {/* Шапка таблицы (правка владельца 2026-09-06): названия колонок —
          ссылки, они же переключатели сортировки. Сетка та же, что у
          колонок строки, поэтому подписи стоят ровно над своими
          ячейками. */}
      <div className={styles.head}>
        <span className={styles.headTitleCell}>{columnHead("title")}</span>
        <div className={styles.cols}>
          {columnHead("status")}
          {columnHead("type")}
          {columnHead("year")}
          {columnHead("country")}
          {columnHead("episodes")}
        </div>
      </div>

      {/* Буквы убраны совсем (правка владельца 2026-09-06): ни жёлоба
          слева, ни рейки справа — таблица читается сплошным списком, а
          порядок задаёт шапка. Серверные страницы буквы (?letter=X)
          живы: они нужны краулеру для перелинковки, туда ведут ссылки
          из карты сайта. */}
      {sortedDramas.length === 0 ? (
        <p className="text-secondary">{q ? t.common.nothingFound : t.catalog.dramas.empty}</p>
      ) : (
        <div className={`d-flex flex-column ${styles.rows}`}>
          {sortedDramas.map((d) => renderRow(d))}
        </div>
      )}
    </div>
  );

  /** Одна строка таблицы. Вынесена из renderItem: её рисуют обе ветки —
   *  и алфавитный список, и плоский отсортированный. */
  function renderRow(d: (typeof dramas)[number]) {
    const score = scoreByDramaId.get(d.id) ?? null;
    const entry = statusByDramaId.get(d.id) ?? null;
    const progress = episodeProgress(entry, d.episodes);
    const airing = d.status === "RETURNING_SERIES";
    return (
            <div key={d.id} className={`surface surface-hover ${styles.row}`}>
              <div className={styles.titleCell}>
                <AppLink href={dramaHref(d)} className={`text-decoration-none ${styles.rowLink}`}>
                  <div className={styles.poster}>
                    {d.posterUrl ? (
                      <UploadImage
                        src={d.posterUrl}
                        alt=""
                        sizes="(max-width: 575.98px) 30vw, 10rem"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <span className={`font-display fw-bold ${styles.posterFallback}`} aria-hidden>
                        {dramaTitleForLocale(d, locale).trim().charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <span className={styles.titleWrap}>
                    <span className={`font-display fw-medium text-white ${styles.title}`}>
                      {dramaTitleForLocale(d, locale)}
                    </span>
                    {score != null && (
                      <span className={`small text-secondary ${styles.meta}`}>
                        ★ {score.toFixed(1)}
                      </span>
                    )}
                  </span>
                </AppLink>
                {airing && (
                  <span className={styles.airingBadge}>{t.catalog.dramaStatus.RETURNING_SERIES}</span>
                )}
              </div>
              <div className={styles.cols}>
                {/* Статус правится прямо в своей колонке (правка
                    владельца 2026-09-06): карандаш у названия убран —
                    он дублировал колонку, ради которой таблица и
                    затевалась. Гостю селект не показываем: он всё равно
                    уедет на страницу входа. */}
                <span className={`${styles.colStatus} table-status-cell`}>
                  {currentUser ? (
                    <DramaStatusSelect dramaId={d.id} status={entry?.status ?? null} />
                  ) : (
                    ""
                  )}
                </span>
                <span className={styles.colType}>{d.type ? t.catalog.dramaType(d.type) : ""}</span>
                <span className={styles.colYear}>{d.year ?? ""}</span>
                <span className={styles.colCountry}>
                  {d.country ? t.catalog.dramaCountry(d.country) : ""}
                </span>
                <span className={`${styles.colRating} table-status-cell`}>
                  {/* Своя оценка (АА2) — правится прямо в строке, как и
                      статус слева; гостю не показываем, он всё равно
                      уедет на страницу входа. */}
                  {currentUser ? (
                    <DramaRatingSelect dramaId={d.id} rating={entry?.rating ?? null} />
                  ) : (
                    ""
                  )}
                </span>
                <span className={styles.colProgress}>
                  {/* Ж6: править серии — прямо отсюда, не заходя на
                      страницу сериала. */}
                  {entry && (
                    <EpisodeProgress
                      dramaId={d.id}
                      total={d.episodes}
                      watched={progress ? progress.watched : null}
                      variant="inline"
                    />
                  )}
                </span>
              </div>
            </div>
    );
  }
}
