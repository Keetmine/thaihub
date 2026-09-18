import * as cheerio from "cheerio";

// Парсер thaistarx.com — англоязычного трекера фан-событий тайских
// артистов (фанмиты, концерты, фанконы, премьеры, финалы серий) по
// всему миру. Найден владельцем 2026-09-18: «давай спарсим всё, чего не
// хватает». На момент разведки на сайте 125 событий, из них в нашем
// каталоге не было 124 — источник закрывает как раз то, чего билетные
// сайты Таиланда не видят: Тайбэй, Макао, Манила, Токио, Сингапур.
//
// Сайт — WordPress с темой CoverNews; REST API закрыт (отдаёт HTML), так
// что разбираем страницы. Всё в обычной разметке, JS не нужен. Здесь —
// только ЧИСТЫЕ функции разбора (без БД, как thaiticketmajor.ts и
// musicFestival.ts) плюс scrape-обёртки; краулер — thaiStarXCrawl.ts.
// Проверяется юнит-тестом tests/unit/thaiStarX.test.ts на сохранённых
// фрагментах живой разметки.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

// Дедлайн на запрос: у fetch в Node своего таймаута нет.
const FETCH_TIMEOUT_MS = 15000;

/** Главный список событий — все категории разом, новые сверху. Отдельный
 *  список «только предстоящие» у сайта есть (`coming-soon-en`), но им
 *  почти не пользуются (одна запись на 125), поэтому суточный обход
 *  листает общий список с первой страницы и останавливается, когда
 *  страница целиком уже знакома. */
export const THAISTARX_LISTING_URL = "https://thaistarx.com/en/category/thai-star-events-en/";

export function thaiStarXListingPageUrl(page: number): string {
  return page <= 1 ? THAISTARX_LISTING_URL : `${THAISTARX_LISTING_URL}page/${page}/`;
}

/** Карточка списка: адрес, название и то, что тема кладёт в CSS-классы
 *  `<article>` — теги и рубрики. Теги тут не декоративны: `tag-20260404-en`
 *  — ДАТА события (у многодневных по тегу на день), остальные — слаги
 *  артистов, пейрингов и агентств (`forcebook`, `namtan-tipnaree`,
 *  `gmmtv`). Даты из тегов надёжнее текста «Date:» — тот пишут вручную в
 *  десятке форматов. */
export type ThaiStarXCard = {
  url: string;
  title: string;
  /** Даты события из тегов, "YYYY-MM-DD", по возрастанию. */
  dates: string[];
  /** Прочие теги (слаги без суффикса `-en`), в порядке разметки. */
  tags: string[];
  /** Рубрики (слаги без `-en`): fan-meeting, thai-star-concert, fancon,
   *  premiere-event, finale-event, past-events, coming-soon… */
  categories: string[];
};

export type ThaiStarXListing = {
  cards: ThaiStarXCard[];
  /** На странице есть ссылка на следующую — листать дальше. */
  hasNext: boolean;
};

/** Ссылка на платформу продаж из блока «Ticket Information». */
export type ThaiStarXTicketLink = { name: string; url: string };

/** Соцсети и прочее, что в блоке билетов ссылкой не на продажи. */
const NON_TICKET_HOSTS = /(^|\.)(x\.com|twitter\.com|facebook\.com|instagram\.com|threads\.(net|com)|l\.threads\.com|t\.me|line\.me|youtube\.com|youtu\.be|tiktok\.com|weibo\.(com|cn)|naver\.com|blog\.naver\.com|thaistarx\.com)$/i;

export function isTicketHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return !NON_TICKET_HOSTS.test(host);
  } catch {
    return false;
  }
}

/** Имя платформы из текста «Ticketing Platforms: A, B» — не дата, не
 *  день недели, не «официальный пост», не слишком длинное. */
function isPlatformName(name: string): boolean {
  const n = name.trim();
  if (!n || n.length > 40) return false;
  if (/\d/.test(n)) return false;
  if (/^(mon|tues|wednes|thurs|fri|satur|sun)day$/i.test(n)) return false;
  if (/official|announcement|faq|blog|details|post on|perks/i.test(n)) return false;
  return true;
}

export type ThaiStarXPost = {
  title: string;
  sourceUrl: string;
  /** Даты события "YYYY-MM-DD" по возрастанию: из тегов, а без них — из
   *  текста «Date:». Пусто — событие без даты, черновик не заводится. */
  dates: string[];
  /** Текст строки «Date:» как есть — в очередь черновиков, глазами. */
  dateText: string | null;
  /** Время начала "HH:mm" по МЕСТНОМУ времени площадки (сайт так и
   *  пишет: «6:30 PM (UTC+9)»), или null — у половины постов его нет. */
  startTime: string | null;
  venue: string | null;
  /** IANA-зона площадки по стране/городу из строки «Venue:» (запас —
   *  смещение из строки времени «(UTC+8)»); null — не распознали, и
   *  событие получит зону по умолчанию (Бангкок). */
  timezone: string | null;
  /** Вступительные абзацы поста — описание события. */
  description: string | null;
  /** Постер: полноразмерная картинка первой иллюстрации поста (из
   *  srcset), запас — og:image (у него уменьшенная версия). */
  posterUrl: string | null;
  /** Старт продаж: дата и время (местное) из строки «Ticket Sales
   *  Open:» / «General Ticket Sales Begin:», когда сайт их даёт. */
  presaleDate: string | null;
  presaleTime: string | null;
  /** Платформы продаж — со ссылками, если сайт их проставил, иначе
   *  только имена (url пустой). */
  ticketLinks: ThaiStarXTicketLink[];
  /** Ссылка на официальный анонс (пост в X и т.п.). */
  announcementUrl: string | null;
  tags: string[];
  categories: string[];
  /** Дата публикации поста (ISO), для сортировки/отладки. */
  publishedAt: string | null;
};

// ---------------------------------------------------------------- адреса

/** Канонический адрес поста: https://thaistarx.com/en/<слаг>/ без
 *  query/hash. Всё, что не пост (рубрики, теги, ленты, хабы вроде
 *  /en/thaistar-events-2/), — null. Хабы отсекаются по известным слагам:
 *  формально они те же страницы WordPress, отличить их по адресу нельзя,
 *  а разбирать как событие бессмысленно. */
const HUB_SLUGS = new Set([
  "thaistar-events-2",
  "thai-series-2",
  "thaistar-news-2",
  "about-us",
  "contact-us",
  "cookie-policy-2",
  "privacy-policy",
  "disclaimer",
  "sitemap",
]);

export function canonicalThaiStarXUrl(href: string): string | null {
  let u: URL;
  try {
    u = new URL(href, "https://thaistarx.com/");
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "thaistarx.com") return null;
  const m = u.pathname.match(/^\/en\/([a-z0-9][a-z0-9-]*)\/?$/i);
  if (!m) return null;
  const slug = m[1].toLowerCase();
  if (HUB_SLUGS.has(slug)) return null;
  if (/^\d{4}$/.test(slug)) return null; // /en/2026/ — архив по дате
  return `https://thaistarx.com/en/${slug}/`;
}

// ------------------------------------------------------------ списочная

function splitArticleClasses(cls: string): { dates: string[]; tags: string[]; categories: string[] } {
  const dates: string[] = [];
  const tags: string[] = [];
  const categories: string[] = [];
  for (const c of cls.split(/\s+/)) {
    let m = c.match(/^tag-(.+?)-en$/);
    if (m) {
      const t = m[1];
      const d = t.match(/^(\d{4})(\d{2})(\d{2})$/);
      if (d) dates.push(`${d[1]}-${d[2]}-${d[3]}`);
      else tags.push(t);
      continue;
    }
    m = c.match(/^category-(.+?)-en$/);
    if (m) categories.push(m[1]);
  }
  dates.sort();
  return { dates: [...new Set(dates)], tags, categories };
}

export function parseThaiStarXListing(html: string, page = 1): ThaiStarXListing {
  const $ = cheerio.load(html);
  const cards: ThaiStarXCard[] = [];
  const seen = new Set<string>();
  $("article").each((_, el) => {
    const art = $(el);
    const meta = splitArticleClasses(art.attr("class") ?? "");
    let url: string | null = null;
    art.find("a[href]").each((_, a) => {
      if (url) return;
      url = canonicalThaiStarXUrl($(a).attr("href") ?? "");
    });
    if (!url || seen.has(url)) return;
    seen.add(url);
    const title =
      art.find("h1 a, h2 a, h3 a, .entry-title a").first().text().replace(/\s+/g, " ").trim() ||
      (art.find("a[title]").first().attr("title") ?? "").replace(/\s+/g, " ").trim();
    cards.push({ url, title, ...meta });
  });
  // Пагинация: тема рисует ссылки на соседние страницы и «next».
  const hasNext =
    $(`a[href*="/page/${page + 1}/"]`).length > 0 || $("a.next, link[rel='next']").length > 0;
  return { cards, hasNext };
}

// ----------------------------------------------------------- дата/время

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Даты из текста «Date:» — запас на случай поста без тегов-дат. Формат
 * вольный: «Saturday, April 4, 2026», «May 24, 2025 (Saturday)», «June 28
 * (Sat) & June 29 (Sun), 2025», «Saturday, July 26 & Sunday, July 27,
 * 2025», «June 13–15, 2025», «4 October 2025». Берём все пары «месяц +
 * число» (и «число + месяц»), год — ближайший справа, диапазон «13–15»
 * разворачиваем. Дни недели и скобки игнорируются.
 */
export function parseThaiStarXDateText(text: string): string[] {
  const s = text.replace(/[–—]/g, "-").replace(/\s+/g, " ");
  const years = [...s.matchAll(/\b(20\d{2})\b/g)].map((m) => ({ y: Number(m[1]), at: m.index ?? 0 }));
  if (years.length === 0) return [];
  const yearFor = (pos: number) => (years.find((y) => y.at >= pos) ?? years[years.length - 1]).y;
  const out = new Set<string>();
  const monthRe = "(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*";
  // «Month D», «Month D-D», «Month D & D»
  // (?!\d) после числа — иначе «October 2025» читается как «October 20».
  for (const m of s.matchAll(new RegExp(`\\b${monthRe}\\.?\\s+(\\d{1,2})(?!\\d)(?:\\s*-\\s*(\\d{1,2})(?!\\d))?`, "gi"))) {
    const mo = MONTHS[m[1].toLowerCase()];
    const from = Number(m[2]);
    const to = m[3] ? Number(m[3]) : from;
    const y = yearFor(m.index ?? 0);
    if (!mo || from < 1 || from > 31) continue;
    for (let d = from; d <= Math.min(to, 31) && d - from < 14; d++) out.add(`${y}-${pad2(mo)}-${pad2(d)}`);
  }
  // «D Month», «D-D Month»
  for (const m of s.matchAll(new RegExp(`(?<!\\d)(\\d{1,2})(?:\\s*-\\s*(\\d{1,2}))?\\s+${monthRe}\\b`, "gi"))) {
    const mo = MONTHS[m[3].toLowerCase()];
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : from;
    const y = yearFor(m.index ?? 0);
    if (!mo || from < 1 || from > 31) continue;
    for (let d = from; d <= Math.min(to, 31) && d - from < 14; d++) out.add(`${y}-${pad2(mo)}-${pad2(d)}`);
  }
  return [...out].sort();
}

/** «6:30 PM (UTC+9)» / «18:00 (UTC+8)» / «17:30 (local time…)» / «10:00
 *  AM» → "HH:mm". Первое время в строке; нет — null. */
export function parseThaiStarXTime(text: string): string | null {
  const m = text.replace(/\s+/g, " ").match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\b/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ap = m[3]?.toLowerCase().replace(/\./g, "");
  // Голое число без минут и без am/pm — это не время («2 nights»).
  if (!m[2] && !ap) return null;
  if (h > 23 || min > 59) return null;
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  return `${pad2(h)}:${pad2(min)}`;
}

/** Смещение «(UTC+8)», «UTC +7», «GMT+9» → часы, или null. */
export function parseUtcOffset(text: string): number | null {
  const m = text.match(/\b(?:UTC|GMT)\s*([+-])\s*(\d{1,2})(?::(\d{2}))?/i);
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) + (m[3] ? Number(m[3]) / 60 : 0));
}

// ------------------------------------------------------------ часовой пояс

/** Страна/город из строки «Venue:» → IANA-зона. Порядок важен: сначала
 *  страны, потом города — «Bangkok, Thailand» и так найдётся, а «Macau»
 *  без страны — по городу. Ключи сравниваются как целые слова без учёта
 *  регистра. */
const PLACE_TIMEZONES: [RegExp, string][] = [
  [/\bthailand\b/i, "Asia/Bangkok"],
  [/\bjapan\b/i, "Asia/Tokyo"],
  [/\btaiwan\b/i, "Asia/Taipei"],
  [/\bhong\s*kong\b/i, "Asia/Hong_Kong"],
  [/\bmacau\b|\bmacao\b/i, "Asia/Macau"],
  [/\bsingapore\b/i, "Asia/Singapore"],
  [/\bphilippines\b/i, "Asia/Manila"],
  [/\bvietnam\b|\bviet\s*nam\b/i, "Asia/Ho_Chi_Minh"],
  [/\bmalaysia\b/i, "Asia/Kuala_Lumpur"],
  [/\bindonesia\b/i, "Asia/Jakarta"],
  [/\bkorea\b/i, "Asia/Seoul"],
  [/\bchina\b|\bprc\b/i, "Asia/Shanghai"],
  [/\bindia\b/i, "Asia/Kolkata"],
  [/\baustralia\b/i, "Australia/Sydney"],
  [/\bmexico\b/i, "America/Mexico_City"],
  [/\bbrazil\b|\bbrasil\b/i, "America/Sao_Paulo"],
  [/\bspain\b|\bespaña\b/i, "Europe/Madrid"],
  [/\bfrance\b/i, "Europe/Paris"],
  [/\bgermany\b/i, "Europe/Berlin"],
  [/\bitaly\b/i, "Europe/Rome"],
  [/\bunited\s+kingdom\b|\buk\b|\bengland\b/i, "Europe/London"],
  [/\bcanada\b/i, "America/Toronto"],
  // Города — когда страны в строке нет.
  // Площадки Бангкока, которые пишут без города.
  [/\bbangkok\b|\bnonthaburi\b|\bpattaya\b|\bchiang\s*mai\b|\bphuket\b|\bsiam\s*paragon\b|\bicon\s*siam\b|\bcentral\s*world\b|\bimpact\s*(arena|exhibition|hall)\b|\bthunder\s*dome\b|\bunion\s*(hall|mall)\b|\bmcc\s*hall\b|\bsamyan\b|\bemquartier\b|\bemsphere\b|\bterminal\s*21\b/i, "Asia/Bangkok"],
  [/\btokyo\b|\bosaka\b|\byokohama\b|\bnagoya\b|\bfukuoka\b|\bsapporo\b/i, "Asia/Tokyo"],
  [/\btaipei\b|\bkaohsiung\b|\btaichung\b|\btainan\b/i, "Asia/Taipei"],
  [/\bmanila\b|\bquezon\b|\bcebu\b|\bpasay\b/i, "Asia/Manila"],
  [/\bseoul\b|\bbusan\b|\bincheon\b/i, "Asia/Seoul"],
  [/\bshanghai\b|\bbeijing\b|\bguangzhou\b|\bshenzhen\b|\bhangzhou\b|\bchengdu\b|\bfuzhou\b|\bxiamen\b|\bnanjing\b|\bwuhan\b|\bchongqing\b|\bsuzhou\b/i, "Asia/Shanghai"],
  [/\bkuala\s*lumpur\b/i, "Asia/Kuala_Lumpur"],
  [/\bjakarta\b|\bbali\b/i, "Asia/Jakarta"],
  [/\bho\s*chi\s*minh\b|\bhanoi\b|\bsaigon\b/i, "Asia/Ho_Chi_Minh"],
  [/\blos\s*angeles\b|\bsan\s*francisco\b|\bseattle\b/i, "America/Los_Angeles"],
  [/\bnew\s*york\b|\bwashington\b|\bboston\b|\bmiami\b/i, "America/New_York"],
  [/\bchicago\b|\bhouston\b|\bdallas\b/i, "America/Chicago"],
  [/\blondon\b|\bmanchester\b/i, "Europe/London"],
  [/\bmadrid\b|\bbarcelona\b/i, "Europe/Madrid"],
  [/\bparis\b/i, "Europe/Paris"],
  [/\bberlin\b/i, "Europe/Berlin"],
  [/\bsydney\b|\bmelbourne\b/i, "Australia/Sydney"],
  [/\bs[ãa]o\s*paulo\b|\brio\b/i, "America/Sao_Paulo"],
  [/\bmexico\s*city\b|\bciudad\s+de\s+m[ée]xico\b/i, "America/Mexico_City"],
  [/\bdenver\b|\bcolorado\b|\bphoenix\b|\bsalt\s*lake\b/i, "America/Denver"],
  [/\batlanta\b|\bphiladelphia\b|\borlando\b/i, "America/New_York"],
  // Страна без узнаваемого города — восток США как самое частое.
  [/\busa\b|\bu\.s\.a?\.?\b|\bunited\s+states\b/i, "America/New_York"],
];

/** Запас по смещению из строки времени: «(UTC+8)» без узнаваемого места
 *  — берём представительную зону. Для +8 это Сингапур: без DST, и
 *  Тайбэй/Манила/Макао/Шанхай в нём читаются одинаково. */
const OFFSET_TIMEZONES: Record<string, string> = {
  "7": "Asia/Bangkok",
  "8": "Asia/Singapore",
  "9": "Asia/Tokyo",
  "5.5": "Asia/Kolkata",
  "-5": "America/New_York",
  "-6": "America/Mexico_City",
  "-8": "America/Los_Angeles",
  "1": "Europe/Madrid",
  "2": "Europe/Madrid",
  "0": "Europe/London",
};

/** Зона площадки: сначала строка «Venue:», потом название поста («…
 *  Fan Meeting in Taipei 2026» — город часто только там), и лишь потом
 *  смещение из строки времени. */
export function timezoneForPlace(
  venue: string | null,
  timeText: string | null,
  title: string | null = null,
): string | null {
  for (const text of [venue, title]) {
    if (!text) continue;
    for (const [re, tz] of PLACE_TIMEZONES) if (re.test(text)) return tz;
  }
  const off = timeText ? parseUtcOffset(timeText) : null;
  if (off !== null) return OFFSET_TIMEZONES[String(off)] ?? null;
  return null;
}

// ---------------------------------------------------------- страница поста

/** Метка `<p><strong>Метка:</strong> значение</p>` → [метка, значение]. */
function labeledLine($: cheerio.CheerioAPI, p: cheerio.Cheerio<import("domhandler").AnyNode>): [string, string] | null {
  const strong = p.find("strong").first();
  if (strong.length === 0) return null;
  const label = strong.text().replace(/\s+/g, " ").replace(/[:：]\s*$/, "").trim();
  if (!label) return null;
  // Значение — весь текст абзаца без метки (метка может быть не в самом
  // начале: «📅 Date:»).
  const full = p.text().replace(/\s+/g, " ").trim();
  const idx = full.indexOf(strong.text().replace(/\s+/g, " ").trim());
  const value = (idx >= 0 ? full.slice(idx + strong.text().replace(/\s+/g, " ").trim().length) : full)
    .replace(/^[\s:：]+/, "")
    .trim();
  return [label, value];
}

/** Самая крупная картинка из srcset («… 1644w»), иначе src. */
function largestFromSrcset(img: cheerio.Cheerio<import("domhandler").AnyNode>): string | null {
  const srcset = img.attr("srcset");
  if (srcset) {
    let best: { url: string; w: number } | null = null;
    for (const part of srcset.split(",")) {
      const [url, size] = part.trim().split(/\s+/);
      const w = size ? Number(size.replace(/w$/, "")) : 0;
      if (url && (!best || w > best.w)) best = { url, w };
    }
    if (best) return best.url;
  }
  return img.attr("src") ?? null;
}

type Section = "intro" | "info" | "tickets" | "announcement" | "other";

function sectionOf(headingText: string): Section {
  const t = headingText.toLowerCase();
  if (t.includes("event information")) return "info";
  if (t.includes("ticket information")) return "tickets";
  if (t.includes("official announcement")) return "announcement";
  if (
    t.includes("reminder") ||
    t.includes("official channels") ||
    t.includes("recommended") ||
    t.includes("more upcoming") ||
    t.includes("post navigation")
  )
    return "other";
  return "intro";
}

export function parseThaiStarXPost(html: string, sourceUrl: string): ThaiStarXPost {
  const $ = cheerio.load(html);
  const article = $("article").first();
  const meta = splitArticleClasses(article.attr("class") ?? "");
  const title = $("h1.entry-title, article h1").first().text().replace(/\s+/g, " ").trim();
  const publishedAt =
    $('meta[property="article:published_time"]').attr("content") ??
    article.find("time[datetime]").first().attr("datetime") ??
    null;

  const content = article.find(".entry-content").first();
  const intro: string[] = [];
  const venueLines: string[] = [];
  // Ссылки из строки «Ticketing Platform(s):» — первыми: именно они
  // «где купить», остальные ссылки блока (сайт организатора, FAQ) —
  // справочные и идут следом.
  const platformLinks: ThaiStarXTicketLink[] = [];
  const otherLinks: ThaiStarXTicketLink[] = [];
  const platformNames: string[] = [];
  // Объект, а не let-переменные: присваивания внутри .each() TypeScript
  // не видит и сужает переменную до null на всё, что после цикла.
  const st: {
    dateText: string | null;
    timeText: string | null;
    salesText: string | null;
    salesMembersOnly: boolean;
    announcementUrl: string | null;
  } = { dateText: null, timeText: null, salesText: null, salesMembersOnly: false, announcementUrl: null };

  let section: Section = "intro";
  // Первый h2 — повтор названия; до него идут метаданные поста и
  // иллюстрация, их не берём. Обход — по всем потомкам в порядке
  // документа, а не по прямым детям: блоки редактора бывают завёрнуты в
  // группы-обёртки, и у половины постов заголовки лежат на уровень
  // глубже. Оглавление плагина (lwptoc) пропускаем целиком.
  let seenFirstHeading = false;
  content.find("h2, h3, p, ul, ol").each((_, el) => {
    const node = $(el);
    if (node.closest(".lwptoc").length > 0) return;
    // Абзац внутри списка считается вместе со списком.
    if (node.parents("li").length > 0) return;
    const tag = (el as { tagName?: string }).tagName?.toLowerCase();
    if (tag === "h2" || tag === "h3") {
      const text = node.text();
      if (!seenFirstHeading) {
        seenFirstHeading = true;
        section = sectionOf(text) === "intro" ? "intro" : sectionOf(text);
      } else {
        section = sectionOf(text);
      }
      return;
    }
    if (!seenFirstHeading) return;
    if (tag !== "p" && tag !== "ul" && tag !== "ol") return;

    if (section === "intro") {
      const text = node.text().replace(/\s+/g, " ").trim();
      if (text) intro.push(text);
      return;
    }
    if (section === "info") {
      const line = labeledLine($, node);
      if (line) {
        const [label, value] = line;
        const l = label.toLowerCase();
        if (/^(📅\s*)?date/.test(l)) {
          st.dateText = value;
          // «Date & Time (UTC+7): 13 June 2025, 7:00 PM» — время тут же.
          if (/time/.test(l) || /\d\s*(am|pm)\b|\b\d{1,2}:\d{2}\b/i.test(value)) {
            st.timeText = st.timeText ?? value;
          }
        } else if (/^(🕒\s*|⏰\s*)?(time|start|show\s*time|doors)/.test(l)) {
          st.timeText = value;
        } else if (/^(📍\s*)?(venue|location|place)/.test(l)) {
          venueLines.push(value);
        }
        return;
      }
      // Строка без метки после площадки — её продолжение («Exhibition
      // Hall 1–2, G Floor,» ↵ «Bangkok»), но не примечание про стрим.
      const text = node.text().replace(/\s+/g, " ").trim();
      if (venueLines.length > 0 && text && !/^[🌐🎥📺⚠️]/.test(text) && !/stream|broadcast|online/i.test(text) && text.length < 120) {
        venueLines.push(text);
      }
      return;
    }
    if (section === "tickets") {
      const line = labeledLine($, node);
      let isPlatformLine = false;
      if (line) {
        const [label, value] = line;
        const l = label.toLowerCase();
        if (/platform|where to buy|tickets?\s*(via|at|on)/.test(l)) {
          isPlatformLine = true;
          for (const name of value.split(/\s*[,、/|]\s*|\s+and\s+|\s+&\s+/i)) {
            const n = name.replace(/\(.*?\)/g, "").trim();
            if (isPlatformName(n)) platformNames.push(n);
          }
        } else if (/sale|open|begin|start|release/.test(l)) {
          // Старт продаж: общая продажа важнее членского пресейла — как
          // у TTM берём «Public Sale»; членская строка остаётся только
          // если общей в посте нет.
          const isMembers = /member|exclusive|fan\s*club|pre-?sale/i.test(l);
          if (!st.salesText || (!isMembers && st.salesMembersOnly)) {
            st.salesText = value;
            st.salesMembersOnly = isMembers;
          }
        }
      }
      node.find("a[href]").each((_, a) => {
        const href = ($(a).attr("href") ?? "").trim();
        const name = $(a).text().replace(/\s+/g, " ").trim();
        if (!/^https?:/i.test(href) || !isTicketHost(href)) return;
        if (platformLinks.some((t) => t.url === href) || otherLinks.some((t) => t.url === href)) return;
        // Имя — текст ссылки, а если это сам адрес или «official
        // website» — хост.
        const host = new URL(href).hostname.replace(/^www\./, "");
        const cleanName = /^https?:/i.test(name) || !isPlatformName(name) ? host : name;
        (isPlatformLine ? platformLinks : otherLinks).push({ name: cleanName, url: href });
      });
      return;
    }
    if (section === "announcement") {
      if (!st.announcementUrl) {
        node.find("a[href]").each((_, a) => {
          const href = ($(a).attr("href") ?? "").trim();
          if (!st.announcementUrl && /^https?:/i.test(href) && !/thaistarx\.com/i.test(href)) st.announcementUrl = href;
        });
      }
    }
  });

  const ticketLinks: ThaiStarXTicketLink[] = [...platformLinks, ...otherLinks];
  // Платформы без ссылок — именами, чтобы список «где продают» был
  // полным, даже когда автор поста ссылку не поставил.
  for (const name of platformNames) {
    if (!ticketLinks.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      ticketLinks.push({ name, url: "" });
    }
  }

  // Даты: теги главнее текста.
  let dates = meta.dates;
  if (dates.length === 0 && st.dateText) dates = parseThaiStarXDateText(st.dateText);

  const venue = venueLines.join(", ").replace(/,\s*,/g, ",").replace(/\s+/g, " ").trim() || null;
  const startTime = st.timeText ? parseThaiStarXTime(st.timeText) : null;
  const timezone = timezoneForPlace(venue, st.timeText, title);

  // Старт продаж: «February 28, 2026 (Saturday) at 10:00 AM (UTC+7)».
  let presaleDate: string | null = null;
  let presaleTime: string | null = null;
  if (st.salesText) {
    const d = parseThaiStarXDateText(st.salesText);
    if (d.length > 0) {
      presaleDate = d[0];
      // Год и число месяца вырезаем, чтобы «28, 2026» не прочлось как время.
      presaleTime = parseThaiStarXTime(st.salesText.replace(/\b20\d{2}\b/g, "").replace(/\b\d{1,2}(st|nd|rd|th)?\b(?!\s*[:.]\d{2}|\s*(am|pm))/gi, ""));
    }
  }

  // Постер: первая иллюстрация поста в полном размере.
  const firstImg = content.find("figure img, img.wp-image, img[srcset]").first();
  const posterUrl =
    (firstImg.length ? largestFromSrcset(firstImg) : null) ??
    $('meta[property="og:image"]').attr("content") ??
    null;

  return {
    title,
    sourceUrl,
    dates,
    dateText: st.dateText,
    startTime,
    venue,
    timezone,
    description: intro.length ? intro.join("\n\n") : null,
    posterUrl,
    presaleDate,
    presaleTime,
    ticketLinks,
    announcementUrl: st.announcementUrl,
    tags: meta.tags,
    categories: meta.categories,
    publishedAt,
  };
}

// ------------------------------------------------------------------ сеть

async function fetchHtml(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en", Accept: "text/html" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (e) {
    throw new Error(`${url} -> ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
  }
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

export async function scrapeThaiStarXListing(page: number): Promise<ThaiStarXListing> {
  return parseThaiStarXListing(await fetchHtml(thaiStarXListingPageUrl(page)), page);
}

export async function scrapeThaiStarXPost(url: string): Promise<ThaiStarXPost> {
  return parseThaiStarXPost(await fetchHtml(url), url);
}
