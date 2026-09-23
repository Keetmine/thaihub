import UploadImage from "@/components/UploadImage";
import { getContentDict } from "@/lib/contentDictionary.server";
import AppLink from "@/components/AppLink";
import ScrollableTabs from "@/components/ScrollableTabs";
import CatalogKindChips from "@/components/CatalogKindChips";
import PosterTile from "@/components/PosterTile";
import PosterRow from "@/components/PosterRow";
import PickDramaButton from "@/components/PickDramaButton";
import { CalendarIcon } from "@/components/icons";
import PageHeader, { WATERMARK_NAME_LIMIT } from "@/components/PageHeader";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import NameSearchBox from "@/components/NameSearchBox";
// Собирает адрес от текущих параметров страницы (назван по месту
// рождения — админским спискам, но логика общая): сортировка не должна
// терять ни поиск, ни вкладку статуса.
import { adminListHref } from "@/lib/adminListHref";
import DramaStatusSelect from "@/components/DramaStatusSelect";
import EpisodeProgress from "@/components/EpisodeProgress";
import DramaRatingSelect from "@/components/DramaRatingSelect";
import { episodeProgress } from "@/lib/watchStatus";
import { getCurrentUser } from "@/lib/userAuth";
import { WATCH_STATUS_ORDER } from "@/lib/watchStatus";
import { getDramaWatchStatuses } from "@/lib/favorites";
import type { DramaWatchStatusValue } from "../../favorites/actions";
import { SEARCH_RESULT_LIMIT } from "@/lib/pagination";
import { dramaHref } from "@/lib/dramaSlug";
import { dramaTitleForLocale } from "@/lib/dramaLocale";
import { dramaTitleWhere } from "@/lib/searchWhere";
import { pageMetadata } from "@/lib/seo";
import { getT } from "@/lib/i18n";
import { unstable_cache } from "next/cache";
import { CATALOG_TAG } from "@/lib/catalogCache";
import { CATALOG_LETTERS, isCatalogLetter, letterPrefixes } from "@/lib/catalogLetters";
import { isDramaKind, kindWhere, parseKind, type CatalogKind } from "@/lib/catalogKinds";
import { findNeighbourDay, getEpisodesOfDay } from "@/lib/newEpisodes";
import EpisodeDayPicker from "@/components/EpisodeDayPicker";
import FilterPanel from "@/components/filters/FilterPanel";
import FilterDisclosure from "@/components/filters/FilterDisclosure";
import CatalogPagination from "@/components/filters/CatalogPagination";
import {
  dramaFilterDefs,
  dramaSortDef,
  dramaFilterWhere,
  loadDramaFilterOptions,
  type FilterParams,
} from "@/lib/catalogFilters";
import { PAGE_SIZE } from "@/lib/pagination";
import { addDays, dateKey, parseDateKey, formatDayLongMonth } from "@/lib/dates";
import styles from "../dramas.module.css";

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
  status: true,
} as const;

/** Гостевой список без поиска: свежие по дате эфира. Только сериалы —
 *  гостю он показывается на разделе «Сериалы», а фильмы и шоу малы
 *  настолько, что показываются целиком (см. getDramasOfKind). */
const getGuestDramas = unstable_cache(
  async () =>
    prisma.drama.findMany({
      where: { ...kindWhere("series"), airedFrom: { not: null } },
      select: DRAMA_ROW_SELECT,
      orderBy: { airedFrom: "desc" },
      take: 60,
    }),
  // v3: ключ сменён вместе с фильтром по типу (2026-09-16) — иначе до
  // истечения кэша в списке оставались бы фильмы и шоу.
  ["dramas-guest-list-v3"],
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

/** Порядок выдачи из ПАНЕЛИ фильтров (правка владельца 2026-09-23):
 *  оценка MyDramaList и дата выхода. Это не колонки таблицы — своего
 *  заголовка у них нет, и умолчание у обоих «по убыванию»: и оценку, и
 *  дату смотрят сверху вниз. Популярность отдельным ключом не нужна —
 *  это умолчание каталога, пустое значение. «По названию» пользуется
 *  колоночным ключом `title`. */
const PANEL_SORTS = {
  mdlScore: (dir: "asc" | "desc"): Prisma.DramaOrderByWithRelationInput[] => [
    { mdlScore: { sort: dir, nulls: "last" } },
    { title: "asc" },
  ],
  // Дата выхода точнее года, но заполнена не у всех — год вторым
  // ключом, иначе половина каталога лежала бы в хвосте вперемешку.
  aired: (dir: "asc" | "desc"): Prisma.DramaOrderByWithRelationInput[] => [
    { airedFrom: { sort: dir, nulls: "last" } },
    { year: { sort: dir, nulls: "last" } },
    { title: "asc" },
  ],
} as const;
type PanelSort = keyof typeof PANEL_SORTS;

export default async function DramasPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    letter?: string;
    sort?: string;
    dir?: string;
    kind?: string;
    page?: string;
    day?: string;
  }>;
}) {
  const sp = await searchParams;
  const {
    q: rawQ,
    status: rawStatus,
    letter: rawLetter,
    sort: rawSort,
    dir: rawDir,
    kind: rawKind,
    page: rawPage,
    day: rawDay,
  } = sp;
  const q = (rawQ ?? "").trim();
  const sortKey = SORT_KEYS.includes(rawSort as SortKey) ? (rawSort as SortKey) : null;
  const panelSort = rawSort && rawSort in PANEL_SORTS ? (rawSort as PanelSort) : null;
  // Колонки по умолчанию идут по возрастанию, порядок из панели — по
  // убыванию: «по оценке» значит «сначала высокие».
  const sortDir: "asc" | "desc" =
    rawDir === "desc" ? "desc" : rawDir === "asc" ? "asc" : panelSort ? "desc" : "asc";

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
  const { t, locale } = await getT();
  const currentUser = await getCurrentUser();

  // Раздел каталога (решение владельца 2026-09-16): сериалы, фильмы,
  // шоу. Новеллы — свой адрес /novels, сюда не попадают. Во время
  // поиска раздел не подсвечен: ищем по всему каталогу (см. ниже).
  const kind: CatalogKind = parseKind(rawKind);
  // «Мой список» — не тип записи, а отметки просмотра. Гостю такого
  // раздела нет: чип ему не показывается, а прямой адрес откатывается
  // на «Сериалы» — иначе человек попадал бы на пустую страницу без
  // объяснений.
  const mine = kind === "mine" && !!currentUser;
  // Разделы каталога (сериалы/фильмы/шоу) листаются постранично, с
  // фильтрами — как выдача поиска. Прежнее правило «без поиска
  // показываем только отмеченное» переехало в «Мой список»: оно решало
  // задачу «не рендерить пять тысяч строк», а её теперь решает
  // постраничная выдача (правка владельца 2026-09-16).
  const paged = !mine && isDramaKind(kind);
  const page = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);

  // Вкладка по умолчанию — «Смотрю сейчас» (правка владельца
  // 2026-09-08): в свой список заходят продолжить начатое. «Все» —
  // отдельный адрес `?status=all`. Поиск сбрасывает вкладку (Ж5):
  // иначе «нашлось 0» при живом сериале в базе.
  const status =
    !mine || q || rawStatus === "all"
      ? null
      : WATCH_STATUS_ORDER.includes(rawStatus as DramaWatchStatusValue)
        ? (rawStatus as DramaWatchStatusValue)
        : "WATCHING";

  /* ---------- выборка списка ---------- */

  // Фильтры каталога — те же, что на /search (жанры, страна, тип,
  // статус, агентство, теги, годы): описания и сборка запроса живут в
  // lib/catalogFilters.ts, здесь только вызов.
  const filterParams = sp as FilterParams;
  const filterOptions = paged ? await loadDramaFilterOptions() : null;
  const filterDefs =
    filterOptions && paged
      ? [dramaSortDef(t), ...dramaFilterDefs(t, filterOptions, await getContentDict())]
      : [];

  // Порядок постраничной выдачи задают ЗАГОЛОВКИ КОЛОНОК — но только
  // каталожные: статус, своя оценка и просмотренные серии лежат в
  // отдельной таблице, на одного человека, и сортировать по ним всю
  // выдачу нельзя. В «Моём списке» они по-прежнему сортируются — там
  // список целиком в памяти (см. sortedDramas ниже).
  const DB_SORTABLE: SortKey[] = ["title", "type", "year", "country"];
  const dbSortKey = paged && sortKey && DB_SORTABLE.includes(sortKey) ? sortKey : null;
  // `nulls: "last"` можно просить только у КОЛОНКИ, которая бывает
  // пустой: у Drama.title он не nullable, и Prisma 7 отвечает на такой
  // orderBy ошибкой — страница ?sort=title падала целиком (сортировка
  // по названию из панели наступила бы на это сразу же).
  const nullableSort = dbSortKey !== "title";
  const pagedOrderBy: Prisma.DramaOrderByWithRelationInput[] = panelSort
    ? PANEL_SORTS[panelSort](sortDir)
    : dbSortKey
    ? [
        nullableSort
          ? { [dbSortKey]: { sort: sortDir, nulls: "last" } }
          : { [dbSortKey]: sortDir },
        { title: "asc" },
      ]
    : // Умолчание — ПО ПОПУЛЯРНОСТИ (правка владельца 2026-09-16):
      // число отметок просмотра. Раньше сверху лежало самое свежее, и
      // первая страница каталога набивалась тайтлами, о которых ещё
      // никто ничего не знает. Популярность — единственный «наш» сигнал
      // у сериала: сердечка у него нет (см. social.md).
      //
      // Год вторым ключом, а не единственным: у сотен записей отметок
      // поровну (ноль), и без него порядок внутри этой массы задавала бы
      // база — то есть он плавал бы между страницами, и одна и та же
      // запись попадалась бы дважды.
      [
        { watchStatuses: { _count: "desc" } },
        { year: { sort: "desc", nulls: "last" } },
        { title: "asc" },
      ];

  const pagedWhere: Prisma.DramaWhereInput = {
    AND: [kindWhere(kind), ...(q ? [dramaTitleWhere(q)] : []), ...dramaFilterWhere(filterParams)],
  };

  const [dramas, totalCount] = paged
    ? await Promise.all([
        prisma.drama.findMany({
          where: pagedWhere,
          select: DRAMA_ROW_SELECT,
          orderBy: pagedOrderBy,
          take: PAGE_SIZE,
          skip: (page - 1) * PAGE_SIZE,
        }),
        prisma.drama.count({ where: pagedWhere }),
      ])
    : [
        q
          ? // Поиск внутри «моего списка» ищет по ВСЕМУ каталогу (Ж5):
            // человек ищет сериал, чтобы его отметить, — значит его в
            // списке ещё нет.
            await prisma.drama.findMany({
              where: dramaTitleWhere(q),
              select: DRAMA_ROW_SELECT,
              orderBy: { title: "asc" },
              take: SEARCH_RESULT_LIMIT,
            })
          : currentUser
            ? await prisma.drama.findMany({
                where: {
                  watchStatuses: {
                    some: status
                      ? { userId: currentUser.id, status }
                      : { userId: currentUser.id },
                  },
                },
                select: DRAMA_ROW_SELECT,
                orderBy: { title: "asc" },
              })
            : // Сюда попадает только гость с `?kind=mine` в адресе —
              // показываем ему обычную витрину сериалов.
              await getGuestDramas(),
        0,
      ];

  const statusByDramaId = await getDramaWatchStatuses(
    dramas.map((d) => d.id),
    currentUser?.id,
  );

  // Сколько сериалов в каждой вкладке «Моего списка» (правка владельца
  // 2026-09-23: «в табах в скобках выводить количество сериалов»).
  // Считаем ОДНИМ запросом по всем статусам сразу, а не выборкой на
  // вкладку: цифра нужна у каждой, включая закрытые.
  const mineCounts = new Map<string, number>();
  if (mine && currentUser) {
    const grouped = await prisma.dramaWatchStatus.groupBy({
      by: ["status"],
      where: { userId: currentUser.id },
      _count: { _all: true },
    });
    for (const row of grouped) mineCounts.set(row.status, row._count._all);
  }
  const mineTotal = [...mineCounts.values()].reduce((sum, n) => sum + n, 0);

  // Оценок у названия в списке нет вовсе (правка владельца
  // 2026-09-09). Сначала убрали чужую цифру с MyDramaList, потом и нашу:
  // в строке каталога подписи не разместить, а голая звёздочка рядом с
  // названием читается как оценка неизвестно чего. Своя оценка правится
  // в колонке «Оценка» — там она подписана.

  // Названия за шапкой — самые популярные сериалы по числу отметок
  // статуса просмотра (единственный «мой» сигнал у сериала, сердечка у
  // него нет). Популярность одна на всех — из кэша.
  const watermarkNames = await getDramasWatermarkNames();

  /* ---------- «Новые серии»: листалка по дням ---------- */
  //
  // Каталог открывался на «Смотрю сейчас», и у девяти зарегистрированных
  // из тринадцати там было пусто: новичок первым делом видел пустую
  // страницу. Сверху теперь то, что есть у всех.
  //
  // Не неделя одной кучей, а ОДИН ДЕНЬ со стрелками (правка владельца
  // 2026-09-16, «как календарь»): куча отвечала на вопрос «что вышло
  // вообще», а не «что вышло в такой-то день», и завтрашние серии в неё
  // не попадали вовсе.
  //
  // Блок рисуется только на разделе «Сериалы» и только без поиска: на
  // «Фильмах» серии говорили бы не о том разделе, где стоит человек, а
  // в результатах поиска отодвигали бы найденное за экран.
  const showcase = !q && kind === "series";
  const today = new Date();
  // Мусор в `?day=` — это сегодня, а не пятисотый год.
  const day =
    rawDay && /^\d{4}-\d{2}-\d{2}$/.test(rawDay) ? parseDateKey(rawDay) : today;
  const [dayEpisodes, prevDay, nextDay] = showcase
    ? await Promise.all([
        getEpisodesOfDay(day),
        findNeighbourDay(day, -1),
        findNeighbourDay(day, 1),
      ])
    : [[], null, null];
  // Подпись дня: «Сегодня» и соседи — словами, дальше датой. Человеку,
  // который открыл каталог, «Сегодня» читается быстрее, чем «16 сентября».
  const todayKey = dateKey(today);
  const dayLabel =
    dateKey(day) === todayKey
      ? t.catalog.showcase.today
      : dateKey(day) === dateKey(addDays(today, -1))
        ? t.catalog.showcase.yesterday
        : dateKey(day) === dateKey(addDays(today, 1))
          ? t.catalog.showcase.tomorrow
          : formatDayLongMonth(day, locale);
  /** Адрес дня — от текущих параметров, чтобы не терять раздел и фильтры. */
  const dayHref = (d: Date) => adminListHref("/dramas", sp, { day: dateKey(d), page: null });

  // ---------- сортировка по колонке таблицы ----------
  //
  // Считаем в JS, а не в запросе: две колонки из шести — «мои» (статус
  // просмотра и просмотренные серии), они живут в отдельной таблице и
  // приезжают картой statusByDramaId. Список тут в сотни строк, не в
  // тысячи (гостю — свежие 60, своему — только отмеченные, поиску —
  // предел выдачи), так что сортировка памяти стоит копейки.
  // Подписи типа и страны — из правимого словаря (админка), а не из
  // i18n: справочник один на все страницы и на обе половины сайта.
  const contentDict = await getContentDict();
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
        return d.type ? contentDict.dramaType(d.type) : null;
      case "year":
        return d.year;
      case "country":
        return d.country ? contentDict.country(d.country) : null;
      case "rating":
        // По СВОЕЙ оценке: колонка про неё, а сводная стоит у названия.
        return entry?.rating ?? null;
      case "episodes":
        return episodeProgress(entry, d.episodes)?.watched ?? null;
      default:
        return null;
    }
  };
  // В постраничной выдаче порядок задаёт БАЗА (pagedOrderBy): досортируй
  // мы тут — переставились бы тридцать строк одной открытой страницы, а
  // человек прочёл бы это как «отсортировано». В «Моём списке» список
  // целиком в памяти, и сортировка в JS честная.
  const sortedDramas = !paged && sortKey
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
      // `page: null` — старый номер страницы относился к другому
      // порядку строк, и после смены сортировки вёл бы в середину
      // незнакомого списка (то же правило в FilterPanel).
      sortKey !== key
        ? { sort: key, dir: null, page: null }
        : sortDir === "asc"
          ? { sort: key, dir: "desc", page: null }
          : { sort: null, dir: null, page: null },
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

  const columnHead = (key: SortKey) => {
    // В постраничной выдаче сортируют ТОЛЬКО каталожные колонки:
    // статус, своя оценка и просмотренные серии лежат в отдельной
    // таблице, на одного человека, и упорядочить по ним всю выдачу
    // нельзя — отсортировалась бы одна открытая страница, что хуже, чем
    // никакой сортировки. В «Моём списке» сортируются все: он целиком в
    // памяти.
    if (paged && !DB_SORTABLE.includes(key)) {
      return (
        <span key={key} className={`${styles.headCell} ${HEAD_COLUMN_CLASS[key]}`}>
          {t.catalog.dramaColumns[key]}
        </span>
      );
    }
    return (
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
  };


  /* Список строками, а не постерная сетка: сериалов много одиночных,
     карточки съедали место, а длинные названия обрезались. Строка «аля
     таблица» (правка владельца 2026-09-05): миниатюра постера, название
     (у выходящих — бейдж «Выходит»), справа колонки статус · тип · год ·
     страна · оценка · прогресс. Геометрия — в dramas.module.css.

     Вынесено в переменную, потому что рисуется в двух обёртках: голой (в
     «Моём списке») и в колонке рядом с фильтрами (разделы каталога). */
  const table = (
    <>
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
          {columnHead("rating")}
          {columnHead("episodes")}
        </div>
      </div>

      {sortedDramas.length === 0 ? (
        <p className="text-secondary">
          {q
            ? t.common.nothingFound
            : paged
              ? t.filters.nothingMatched
              : t.catalog.dramas.empty}
        </p>
      ) : (
        <div className={`d-flex flex-column ${styles.rows}`}>
          {sortedDramas.map((d) => renderRow(d))}
        </div>
      )}
    </>
  );

  return (
    <div>
      <PageHeader
        eyebrow={t.catalog.eyebrow}
        title={t.catalog.dramas.title}
        size="lg"
        gapOnTitle
        watermark="Catalogue"
        watermarkNames={watermarkNames}
      />

      {/* Разделы каталога: сериалы · фильмы · шоу · новеллы · мой
          список. Ряд стоит СРАЗУ ПОД ШАПКОЙ (правка владельца
          2026-09-16): это главный переключатель страницы, и всё
          остальное — уже содержимое выбранного раздела.
          Во время поиска не подсвечен ни один: ищем по всему каталогу. */}
      <CatalogKindChips active={q ? null : kind} loggedIn={!!currentUser} />

      {showcase && (
        <section className="mb-5">
          <h2 className="section-heading mb-3">{t.catalog.showcase.newEpisodes}</h2>

          {/* Один ряд управления (правка владельца 2026-09-16): слева
              листалка дней с календарём, справа — «Расписание». Раньше
              кнопка стояла строкой выше, у заголовка, и ряд под ней
              выглядел оторванным.

              Стрелки — обычные ссылки (работают без JS и открываются в
              новой вкладке), выбор даты — свой календарь проекта.
              Стрелка прыгает на БЛИЖАЙШИЙ день с сериями, а не на
              соседние сутки: в межсезонье иначе приходилось бы кликать
              её пять раз подряд по пустым дням. Нет такого дня впереди —
              стрелка гаснет. */}
          <div className="episode-day-nav mb-3">
            {prevDay ? (
              <AppLink
                href={dayHref(prevDay)}
                prefetch={false}
                className="btn btn-ghost btn-sm"
                aria-label={t.catalog.showcase.prevDay}
                title={t.catalog.showcase.prevDay}
              >
                ←
              </AppLink>
            ) : (
              <span className="btn btn-ghost btn-sm disabled" aria-hidden>
                ←
              </span>
            )}
            <span className="episode-day-label small text-secondary">{dayLabel}</span>
            {nextDay ? (
              <AppLink
                href={dayHref(nextDay)}
                prefetch={false}
                className="btn btn-ghost btn-sm"
                aria-label={t.catalog.showcase.nextDay}
                title={t.catalog.showcase.nextDay}
              >
                →
              </AppLink>
            ) : (
              <span className="btn btn-ghost btn-sm disabled" aria-hidden>
                →
              </span>
            )}
            <EpisodeDayPicker day={dateKey(day)} />

            {/* «Расписание» — кнопка с подписью, а не голая иконка:
                иконку рядом с поиском никто не находил (жалоба
                владельца). Прижата к правому краю ряда. `from=catalog` —
                чтобы «назад» в календаре вернуло сюда, а не в афишу. */}
            <AppLink
              href="/calendar?view=series&from=catalog"
              prefetch={false}
              className="btn btn-ghost btn-sm d-inline-flex align-items-center gap-2 ms-auto"
            >
              <CalendarIcon />
              {t.catalog.showcase.schedule}
            </AppLink>
          </div>

          {/* ОДИН РЯД с прокруткой, а не сетка в несколько строк
              (правка владельца 2026-09-16): в день выходит и десять
              серий, и сетка отжимала бы каталог на второй экран.
              Стрелки листания рисует PosterRow. */}
          {dayEpisodes.length === 0 ? (
            <p className="text-secondary mb-0">{t.catalog.showcase.dayEmpty}</p>
          ) : (
            <PosterRow size="lg">
              {dayEpisodes.map((d) => (
                <PosterTile
                  key={d.id}
                  href={dramaHref(d)}
                  posterUrl={d.posterUrl}
                  title={dramaTitleForLocale(d, locale)}
                  subtitle={d.year ? String(d.year) : undefined}
                  chip={t.catalog.showcase.episodeChip(d.numbers)}
                />
              ))}
            </PosterRow>
          )}
        </section>
      )}

      <div className="tab-bar-row">
        {/* Ряд вкладок есть только в «Моём списке»: у разделов каталога
            вкладок статуса нет. Пустую обёртку не рисуем вовсе — у неё
            `flex: 1`, и она отжимала поиск в середину строки вместо
            левого края. */}
        {mine && (
        <ScrollableTabs>
          {/* Статусы идут первыми, «Все» — последней справа (правка
              владельца 2026-09-08): каталог открывается на «Смотрю
              сейчас», и полный список стал не отправной точкой, а
              соседней вкладкой. */}
          {mine && WATCH_STATUS_ORDER.map((s) => (
            <AppLink
              key={s}
              href={`/dramas?kind=mine&status=${s}`}
              prefetch={false}
              className={`tab-bar-item ${status === s ? "active" : ""}`}
            >
              {/* Число в скобках — как у вкладок поездки. Нулевую вкладку
                  не прячем: она объясняет, что статус вообще есть, а
                  пустые скобки только шумели бы. */}
              {t.catalog.watchStatus[s]}
              {mineCounts.get(s) ? ` (${mineCounts.get(s)})` : ""}
            </AppLink>
          ))}
          {mine && (
            <AppLink
              href={`/dramas?kind=mine&status=all${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              prefetch={false}
              className={`tab-bar-item ${!status ? "active" : ""}`}
            >
              {t.catalog.all}
              {mineTotal ? ` (${mineTotal})` : ""}
            </AppLink>
          )}
        </ScrollableTabs>
        )}
        {/* Поиск и кнопки подбора — ТОЛЬКО в разделах каталога (правка
            владельца 2026-09-16: «календарь, поиск, подобрать сериал и
            удиви меня убираем из мой список»). В своём списке они не про
            то: искать там нечего — он и так перед глазами, а подбирать
            новое из уже отмеченного бессмысленно.

            Поиск — СЛЕВА и крупный: в разделе на пять тысяч записей это
            основной инструмент, а не кнопка в ряду. */}
        {!mine && (
          <>
        <NameSearchBox
          action="/dramas"
          q={q}
          big
          placeholder={t.catalog.searchByTitle}
          className="catalog-search"
        />
        <div className="d-flex align-items-center gap-2 flex-shrink-0 ms-auto">
          {/* Рулетка «что посмотреть» (аудит, п. 6.3): 302 на случайный
              сериал (роут /dramas/random), у залогиненного — без уже
              отмеченных. Кнопка проносит поисковый запрос q — других
              фильтров у этой страницы в адресе нет (вкладки статусов
              рулетке не нужны: отмеченное она и так исключает).
              prefetch выключен: префетч ссылки дёргал бы редирект со
              случайным исходом впустую. Текст прячется на узком экране —
              в ряду с поиском ему не хватает места, кость остаётся. */}
          {/* «Подобрать сериал» — квиз в попапе (правка владельца
              2026-09-16). Стоит слева от рулетки: рулетка отдаёт
              случайное, а квиз спрашивает, чего человек хочет, и это
              более «главное» действие из двух. */}
          <PickDramaButton loggedIn={!!currentUser} />
          <AppLink
            href={`/dramas/random${q ? `?q=${encodeURIComponent(q)}` : ""}`}
            prefetch={false}
            className="btn btn-ghost btn-sm flex-shrink-0"
            aria-label={t.catalog.dramas.roulette}
            title={t.catalog.dramas.roulette}
          >
            <span aria-hidden>🎲</span>
            <span className="d-none d-md-inline ms-1">
              {t.catalog.dramas.roulette}
            </span>
          </AppLink>
          {/* На «Сериалах» расписание уже есть кнопкой с подписью над
              блоком «Новые серии» — второй раз иконкой не дублируем. На
              остальных разделах она остаётся единственным входом в
              календарь серий. */}
          {!showcase && (
            <AppLink
              href="/calendar?view=series&from=catalog"
              className="btn btn-ghost btn-sm flex-shrink-0"
              aria-label={t.catalog.dramas.calendarLink}
              title={t.catalog.dramas.calendarLink}
            >
              <CalendarIcon />
            </AppLink>
          )}
        </div>
          </>
        )}
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

      {paged ? (
        /* Раздел каталога — как выдача поиска: список слева, фильтры
           колонкой справа, на телефоне колонка становится раскрывашкой
           над списком (правка владельца 2026-09-16 — «мб вообще
           объединим визуально со страницей поиска»). Фильтры и
           сортировка живут в адресе, поэтому срез можно переслать. */
        <div className="row g-4">
          <div className="col-12 col-lg-9">
            {/* Счётчика «Найдено: N» тут нет (правка владельца
                2026-09-16): на витрине каталога число записей ничего не
                решает, а строка над таблицей отодвигала её вниз. На
                /search он остаётся — там это результат запроса. */}
            {table}
            <CatalogPagination
              page={page}
              pages={Math.max(1, Math.ceil(totalCount / PAGE_SIZE))}
              params={filterParams}
              basePath="/dramas"
            />
          </div>
          <aside className="col-12 col-lg-3 order-first order-lg-last">
            <div className="d-lg-none">
              <FilterDisclosure title={t.filters.panelTitle}>
                <FilterPanel defs={filterDefs} />
              </FilterDisclosure>
            </div>
            <div className="d-none d-lg-block search-filter-aside">
              <p className="section-heading mb-3">{t.filters.panelTitle}</p>
              <FilterPanel defs={filterDefs} />
            </div>
          </aside>
        </div>
      ) : (
        table
      )}
    </div>
  );

  /** Одна строка таблицы. Вынесена из renderItem: её рисуют обе ветки —
   *  и алфавитный список, и плоский отсортированный. */
  function renderRow(d: (typeof dramas)[number]) {
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
                <span className={styles.colType}>{d.type ? contentDict.dramaType(d.type) : ""}</span>
                <span className={styles.colYear}>{d.year ?? ""}</span>
                <span className={styles.colCountry}>
                  {d.country ? contentDict.country(d.country) : ""}
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
