import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { catalogEventsWhere } from "@/lib/catalogEvents";
import { SITE_URL } from "@/lib/seo";
import { LOCALES, localeHref } from "@/lib/i18n/config";
import { CATALOG_TAG } from "@/lib/catalogCache";

// Одним файлом карта сайта весила 8–9 МБ и считалась секундами: робот
// на каждый заход тянул весь каталог, а в Search Console покрытие было
// свалено в кучу — не видно, какой раздел проиндексирован. Теперь это
// sitemap index по старому адресу /sitemap.xml со ссылками на шарды
// /sitemap/<раздел>-<номер>.xml.
//
// ПОЧЕМУ НЕ generateSitemaps. Штатный механизм Next
// (node_modules/next/dist/docs/.../generate-sitemaps.md) даёт ровно
// такие адреса, но, появившись в app/sitemap.ts, он ПЕРЕНОСИТ маршрут
// на /sitemap/[__metadata_id__] и адрес /sitemap.xml просто исчезает
// (см. normalizeMetadataPageToRoute в next/dist/lib/metadata/
// get-metadata-route.js). Отдать индекс с освободившегося адреса тоже
// не выходит: Turbopack 16.3 считает файл-конвенцию и соседний
// route-handler одним маршрутом и валит сборку —
//   «Conflicting route and metadata at /sitemap.xml:
//    route at /sitemap.xml/route and metadata at /sitemap.xml/route».
// А индекс в любом случае пришлось бы писать руками: resolveRouteData
// в Next умеет только <urlset>, тега <sitemapindex> у него нет.
// /sitemap.xml отправлен в Google Search Console и Яндекс.Вебмастер и
// ломать его нельзя — поэтому оба маршрута обычные route-handler'ы:
// src/app/sitemap.xml/route.ts (индекс) и
// src/app/sitemap/[shard]/route.ts (шарды).

/** Сколько СТРАНИЦ (не URL) кладём в один шард. Каждая страница даёт
 *  по записи на локаль, то есть URL в шарде вдвое больше. */
const PATHS_PER_SHARD = 2000;

/** Разделы каталога. Порядок — порядок ссылок в индексе.
 *  События здесь с тех пор, как карточка /event/… стала публичной
 *  (тизер афиши): за подпиской на ней остались только личные блоки,
 *  а что/когда/где открыто всем. Прошедшие события тоже перечисляем —
 *  страница остаётся валидной и после даты. */
const SECTIONS = ["dramas", "artists", "novels", "locations", "agencies", "events", "wiki"] as const;
type Section = (typeof SECTIONS)[number];

/** id шарда со статикой — витрины и текстовые страницы. */
const STATIC_ID = "pages";

type Row = { path: string; lastModified?: Date };

// Сортировка по id (cuid начинается с временной метки) ≈ порядок
// создания: новые записи приходят в конец, границы шардов не едут при
// каждом импорте. Слаг для этого не годится — вставка в середину
// алфавита сдвинула бы весь хвост между шардами.
const BY_ID = { id: "asc" } as const;

const fetchers: Record<Section, () => Promise<Row[]>> = {
  dramas: async () =>
    (
      await prisma.drama.findMany({ select: { slug: true }, where: { slug: { not: null } }, orderBy: BY_ID })
    ).map((d) => ({ path: `/dramas/${d.slug}` })),
  artists: async () =>
    (
      await prisma.performer.findMany({ select: { slug: true }, where: { slug: { not: null } }, orderBy: BY_ID })
    ).map((p) => ({ path: `/artists/${p.slug}` })),
  novels: async () =>
    (
      await prisma.novel.findMany({ select: { slug: true }, where: { slug: { not: null } }, orderBy: BY_ID })
    ).map((n) => ({ path: `/novels/${n.slug}` })),
  locations: async () =>
    (
      await prisma.location.findMany({
        select: { slug: true },
        where: { slug: { not: null }, createdByUserId: null },
        orderBy: BY_ID,
      })
    ).map((l) => ({ path: `/locations/${l.slug}` })),
  agencies: async () =>
    (
      await prisma.agency.findMany({ select: { slug: true }, where: { slug: { not: null } }, orderBy: BY_ID })
    ).map((a) => ({ path: `/agencies/${a.slug}` })),
  // Маршрут карточки — /event/… в единственном числе (/events — лента).
  events: async () =>
    (
      // Карта сайта — только каталог: встречу сообщества поисковику не
      // отдают (см. src/lib/catalogEvents.ts). Слага у неё и так нет,
      // но условие стоит явно: правило важнее совпадения.
      await prisma.event.findMany({
        select: { slug: true },
        where: { ...catalogEventsWhere(), slug: { not: null } },
        orderBy: BY_ID,
      })
    ).map((e) => ({ path: `/event/${e.slug}` })),
  wiki: async () =>
    (
      await prisma.wikiArticle.findMany({
        select: { slug: true, id: true, updatedAt: true },
        where: { published: true },
        orderBy: BY_ID,
      })
    ).map((w) => ({ path: `/wiki/${w.slug ?? w.id}`, lastModified: w.updatedAt })),
};

const counters: Record<Section, () => Promise<number>> = {
  dramas: () => prisma.drama.count({ where: { slug: { not: null } } }),
  artists: () => prisma.performer.count({ where: { slug: { not: null } } }),
  novels: () => prisma.novel.count({ where: { slug: { not: null } } }),
  locations: () => prisma.location.count({ where: { slug: { not: null }, createdByUserId: null } }),
  agencies: () => prisma.agency.count({ where: { slug: { not: null } } }),
  events: () =>
    prisma.event.count({ where: { ...catalogEventsWhere(), slug: { not: null } } }),
  wiki: () => prisma.wikiArticle.count({ where: { published: true } }),
};

// Кэш на полчаса, как было у единой карты: роботы дёргают sitemap
// постоянно. Тег catalog — админская правка каталога сбрасывает кэш
// раньше (logAudit → invalidateCatalogCache).
//
// Ключи разные для каждого раздела: запрос /sitemap/artists-2.xml
// поднимает только список артистов, а не весь каталог, как раньше. Все
// шарды одного раздела обслуживает ОДНА запись кэша — то есть один
// поход в базу на раздел за полчаса, сколько бы шардов его ни делили.
const cachedRows = Object.fromEntries(
  SECTIONS.map((section) => [
    section,
    unstable_cache(fetchers[section], ["sitemap-rows", section], {
      revalidate: 1800,
      tags: [CATALOG_TAG],
    }),
  ]),
) as Record<Section, () => Promise<Row[]>>;

// Отдельный дешёвый счётчик: оглавление нужно и индексу, и каждому
// запросу шарда (проверить, что id существует), а поднимать ради этого
// все слаги — то самое, от чего уходили.
const getSectionCounts = unstable_cache(
  async () => {
    const counts = await Promise.all(SECTIONS.map((section) => counters[section]()));
    return Object.fromEntries(SECTIONS.map((section, i) => [section, counts[i]])) as Record<Section, number>;
  },
  ["sitemap-counts"],
  { revalidate: 1800, tags: [CATALOG_TAG] },
);

/** Статические страницы витрины. Дат нет намеренно — см. `entries`.
 *  /calendar здесь больше нет: календарь — платная функция, робот
 *  получает пейволл, а страница помечена noIndex (не витрина, решение
 *  из аудита 2026-09). /events и /communities — гостевые витрины,
 *  /locations/map — карта каталога, /privacy и /terms — правовые
 *  тексты, /dramas/top — народный топ по нашим оценкам: всё публичное
 *  и индексируемое. */
const STATIC_PATHS = [
  "/",
  "/about",
  "/help",
  "/dramas",
  "/dramas/top",
  "/artists",
  "/novels",
  "/locations",
  "/locations/map",
  "/events",
  "/communities",
  "/wiki",
  // Витрина музыкальных релизов — открыта гостю, обновляется суточным
  // импортом (features/home.md).
  "/music",
  // Мини-игра «Угадай сериал по постеру» — гостевая витрина.
  "/game",
  "/privacy",
  "/terms",
];

/** Оглавление: список id шардов в порядке вывода в индексе. */
export async function listSitemapShards(): Promise<string[]> {
  const counts = await getSectionCounts();
  const ids = [STATIC_ID];
  for (const section of SECTIONS) {
    // Пустой раздел всё равно получает один шард: адрес не должен
    // пропадать из индекса из-за временно опустевшей выборки.
    const total = shardCount(counts[section] ?? 0);
    for (let i = 1; i <= total; i++) ids.push(`${section}-${i}`);
  }
  return ids;
}

function shardCount(rows: number): number {
  return Math.max(1, Math.ceil(rows / PATHS_PER_SHARD));
}

/** Абсолютный адрес шарда. */
export function shardUrl(id: string): string {
  return `${SITE_URL}/sitemap/${id}.xml`;
}

// Каждая страница попадает в карту ДВАЖДЫ — по разу на язык, и у
// каждой записи проставлены alternates: так поисковик видит, что это
// две версии одной страницы, а не дубли. Английский живёт на путях
// без префикса, русский — под /ru (см. docs/features/i18n.md).
//
// У карточек каталога даты нет намеренно.
//
// `updatedAt` — это `@updatedAt`: Prisma освежает его на КАЖДОМ
// UPDATE, даже когда записаны те же самые значения. Массовый прогон
// синхронизации проходит по всему каталогу — и дата у тысяч страниц
// становится сегодняшней, хотя для читателя не изменилось ничего.
// Поисковику мы таким образом сообщали о правке, которой не было, а
// он показывал её в выдаче: «Victor (Chatchawit Techarukpong) —
// MyBLHub. 5 дней назад — …».
//
// Указания «не показывай дату» у поисковиков нет: дату убирают, убрав
// сигналы, из которых она берётся. На карточках их больше нет —
// ни в JSON-LD (Person/TVSeries без dateModified), ни в мете, ни в
// тексте, — так что sitemap оставался единственным.
//
// У вики дата осталась: там правки живые, человеческие, и «обновлено»
// читателю действительно что-то говорит.
function entries(row: Row): string {
  // x-default дублирует то, что страницы отдают в hreflang-мете
  // (pageMetadata): чей язык не совпал — тому английскую версию.
  // Сигналы в мете и в sitemap должны совпадать, иначе поисковик
  // выбирает сам.
  const alternates =
    LOCALES.map(
      (l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${xml(`${SITE_URL}${localeHref(row.path, l)}`)}" />`,
    ).join("\n") + `\n<xhtml:link rel="alternate" hreflang="x-default" href="${xml(`${SITE_URL}${row.path}`)}" />`;
  const lastmod = row.lastModified ? `\n<lastmod>${row.lastModified.toISOString()}</lastmod>` : "";
  return LOCALES.map(
    (l) =>
      `<url>\n<loc>${xml(`${SITE_URL}${localeHref(row.path, l)}`)}</loc>\n${alternates}${lastmod}\n</url>\n`,
  ).join("");
}

/** Слаги приходят из импортёров, а не только из формы — экранируем. */
function xml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function parseShardId(id: string): { section: Section; index: number } | null {
  const at = id.lastIndexOf("-");
  if (at < 1) return null;
  const section = id.slice(0, at) as Section;
  const index = Number(id.slice(at + 1));
  if (!SECTIONS.includes(section) || !Number.isInteger(index) || index < 1) return null;
  return { section, index };
}

/** Готовый XML одного шарда либо null, если такого id нет (→ 404). */
export async function renderSitemapShard(id: string): Promise<string | null> {
  let rows: Row[];

  if (id === STATIC_ID) {
    rows = STATIC_PATHS.map((path) => ({ path }));
  } else {
    const parsed = parseShardId(id);
    if (!parsed) return null;
    const [all, counts] = await Promise.all([cachedRows[parsed.section](), getSectionCounts()]);
    if (parsed.index > shardCount(counts[parsed.section] ?? 0)) return null;
    const start = (parsed.index - 1) * PATHS_PER_SHARD;
    // Последний шард раздела забирает весь хвост без верхней границы:
    // счётчик и список слагов лежат в РАЗНЫХ записях кэша и на время TTL
    // могут разъехаться. Так ни одна запись не потеряется между шардами,
    // в худшем случае последний окажется чуть толще расчётного.
    rows =
      parsed.index === shardCount(counts[parsed.section] ?? 0)
        ? all.slice(start)
        : all.slice(start, start + PATHS_PER_SHARD);
  }

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    rows.map(entries).join("") +
    "</urlset>\n"
  );
}

/** Готовый XML оглавления — то, что отдаётся по /sitemap.xml. */
export async function renderSitemapIndex(): Promise<string> {
  const ids = await listSitemapShards();
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    ids.map((id) => `<sitemap>\n<loc>${xml(shardUrl(id))}</loc>\n</sitemap>\n`).join("") +
    "</sitemapindex>\n"
  );
}

/** Заголовки, которые Next ставит своим метаданным-маршрутам. */
export const SITEMAP_HEADERS = {
  "Content-Type": "application/xml",
  "Cache-Control": "public, max-age=0, must-revalidate",
} as const;
