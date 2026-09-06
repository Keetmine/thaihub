// Разбор карточек asiapoisk.com — чистые функции без Prisma и без
// сети, чтобы их гонял tests/unit/asiapoisk.test.ts на сохранённых
// кусках разметки. Сама синхронизация — в asiapoiskSync.ts.
//
// Зачем сайт: у него ~27 000 карточек с РУССКИМИ названиями, и он
// закрывает часть нашего каталога, до которой не дотянулся dorama.land
// (решение владельца 2026-09-06). Заодно у их карточек есть страна —
// ею мы заполняем свои пустые (у нас 3118 сериалов без страны).
//
// Правила сайта соблюдаем: robots.txt закрывает фильтры, «популярное» и
// поиск (и они честно отдают 403), а карточки открыты; просят паузу
// между запросами — держим её в синке. Список карточек берём из карты
// сайта: постраничная листалка в robots.txt запрещена, карта — нет.

export const ASIAPOISK_ORIGIN = "https://asiapoisk.com";
export const ASIAPOISK_SITEMAP_URL = `${ASIAPOISK_ORIGIN}/sitemap.xml`;

/** Что удалось прочитать с карточки. */
export type AsiapoiskPage = {
  /** Русское название. null — в заголовке его нет (бывает: там просто
   *  продублирована латиница). */
  titleRu: string | null;
  /** Остальные названия из заголовка: английское, оригинальное. */
  altTitles: string[];
  /** Страна как её пишет сайт («Таиланд») — нормализуется отдельно. */
  countryRu: string | null;
  /** Годы из заголовка: у многосезонных их два («2006, 2007»). */
  years: number[];
  sourceUrl: string;
};

/** Их русские страны → наши английские (`Drama.country`). */
const COUNTRY_MAP: Record<string, string> = {
  таиланд: "Thailand",
  "южная корея": "South Korea",
  корея: "South Korea",
  япония: "Japan",
  китай: "China",
  тайвань: "Taiwan",
  гонконг: "Hong Kong",
  сингапур: "Singapore",
  филиппины: "Philippines",
  вьетнам: "Vietnam",
  индия: "India",
  индонезия: "Indonesia",
  малайзия: "Malaysia",
  монголия: "Mongolia",
  камбоджа: "Cambodia",
};

export function normalizeCountry(countryRu: string | null): string | null {
  if (!countryRu) return null;
  return COUNTRY_MAP[countryRu.trim().toLowerCase()] ?? null;
}

/** Есть ли в строке кириллица. Нужно, чтобы не принять за перевод
 *  продублированную латиницу: у части карточек «русское» название —
 *  это то же английское. */
export function hasCyrillic(text: string): boolean {
  return /[а-яё]/i.test(text);
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * Карточка сериала. Всё нужное лежит в `<title>`:
 *
 *   Дорама Море алчности / Talay Rissaya / ทะเลริษยา (Таиланд, 2006, 2007) — …
 *
 * Читаем именно его, а не разметку страницы: у сайта она меняется чаще
 * заголовка, а нам нужны ровно четыре вещи — русское название, прочие
 * названия, страна и годы.
 */
export function parseAsiapoiskPage(html: string, sourceUrl: string): AsiapoiskPage {
  const raw = /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "";
  const title = decodeEntities(raw).replace(/\s+/g, " ").trim();

  // Скобки со страной и годами — в конце названия, до хвоста сайта.
  const meta = /\(([^()]*)\)\s*(?:[-—]|$)/.exec(title)?.[1] ?? "";
  const metaParts = meta.split(",").map((p) => p.trim()).filter(Boolean);
  const years = metaParts
    .map((p) => Number.parseInt(p, 10))
    .filter((n) => Number.isFinite(n) && n > 1900 && n < 2100);
  const countryRu = metaParts.find((p) => !/^\d{4}$/.test(p)) ?? null;

  // Названия — до скобок; «Дорама»/«Фильм» в начале служебное.
  const namesPart = title.split("(")[0].replace(/^(Дорама|Фильм|Сериал)\s+/i, "").trim();
  const names = namesPart
    .split("/")
    .map((n) => n.trim())
    .filter(Boolean);

  const titleRu = names.find(hasCyrillic) ?? null;
  const altTitles = names.filter((n) => n !== titleRu);

  return {
    titleRu,
    altTitles,
    countryRu: countryRu && !/^\d/.test(countryRu) ? countryRu : null,
    years,
    sourceUrl,
  };
}

/** Адреса карточек из карты сайта. Служебные подстраницы карточки
 *  (`/actors`, `/series`…) отбрасываем — они не про названия. */
export function parseAsiapoiskSitemap(xml: string): string[] {
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  return urls.filter(
    (u) =>
      u.startsWith(`${ASIAPOISK_ORIGIN}/doramas/`) &&
      !/\/(actors|creators|series|photos|reviews|comments)$/.test(u) &&
      !/\/doramas\/(filter|popular|alphabetical|schedule)/.test(u),
  );
}

/** Адреса вложенных карт из индекса `sitemap.xml`. */
export function parseSitemapIndex(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+\.xml)<\/loc>/g)].map((m) => m[1].trim());
}

/**
 * Ключ сведения: название в нижнем регистре без знаков. По нему их слаг
 * (в нём английское название, иногда с годом) сходится с нашим
 * `Drama.title` — так каталоги сверяются ПО КАРТЕ САЙТА, не открывая ни
 * одной страницы.
 */
export function matchKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

/** Ключи, под которыми карточка встаёт в указатель: со своим годом в
 *  слаге и без него — у нас год хранится отдельным полем. */
export function sitemapKeys(url: string): string[] {
  const slug = url.split("/doramas/")[1] ?? "";
  if (!slug) return [];
  const withoutYear = slug.replace(/_(19|20)\d{2}$/, "");
  return withoutYear === slug ? [matchKey(slug)] : [matchKey(slug), matchKey(withoutYear)];
}
