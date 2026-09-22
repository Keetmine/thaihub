import * as cheerio from "cheerio";

// Scraper for thaiticketmajor.com event pages. Pure functions only: no DB
// access here (see thaiticketmajorImport.ts for that), so this module is
// safe to import from both the Next.js app and a standalone script.
//
// Two data sources on each page:
//  - a `schema.org/Event` JSON-LD block: title, dates, venue, poster —
//    reliable and consistent site-wide.
//  - a free-text "details" table (admin-entered per event, not guaranteed
//    to have every row) that's the only place the artist lineup and the
//    display price string live. The site renders this table in Thai by
//    default; setting the `__la=en` cookie (what its own language-switch
//    button does client-side) gets the same table back in English with a
//    plain HTTP request — no headless browser needed.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 MyBLHubImporter/1.0 (personal fan-tracker, contact via site)";

export type TtmArtist = { fullName: string; nickname: string };

export type TtmEvent = {
  title: string;
  venue: string | null;
  posterUrl: string | null;
  // Kept as plain "YYYY-MM-DD" / "HH:mm" strings, sliced directly out of
  // the JSON-LD's naive ISO datetime (no trailing "Z"/offset — it's
  // already Bangkok wall-clock time). Deliberately NOT parsed through
  // `new Date(...)`: that would reinterpret it in whatever timezone the
  // Node process happens to run in, silently shifting the hour — the
  // same "local wall-clock, no explicit timezone" convention the rest of
  // the app already relies on (see combineDateTime in events/actions.ts).
  date: string | null;
  startTime: string | null;
  // Extra days beyond `date`, when the page's date line lists more than
  // one (e.g. "Saturday 24 - Sunday 25 October 2026" or a 3-night run) —
  // parsed from `dateRangeText` below. Same start time is assumed for
  // each (the site doesn't give per-day times in this line, and that
  // matches how MyBLHub's own multi-day event creation already works).
  extraDates: string[];
  dateRangeText: string | null;
  ticketPrice: string | null;
  /** Описание события, если сайт его отдаёт (TTM — нет: его таблица
   *  деталей разбирается на состав и цену, связного текста там нет). */
  description: string | null;
  // When tickets go on sale ("Public Sale" in the page's summary panel,
  // distinct from the free-text details table below it) — same
  // date/time-as-strings treatment as `date`/`startTime` above, and same
  // reason (no timezone reinterpretation). Only the first "Public Sale"
  // entry is used when a page lists several sale phases (e.g. presale
  // then general sale).
  presaleDate: string | null;
  presaleTime: string | null;
  /** Картинки «для покупателей» со страницы: план зала, что входит в
   *  билет, условия трансляции (просьба владельца 2026-09-22: «брать
   *  три картинки и вставлять их в фото события»). TTM держит их в
   *  /cmsimg/imgeditor/ и нумерует в имени файла — по номеру и
   *  сортируем, порядок в разметке бывает любым. Необязательное: у
   *  других источников этого блока нет, и форму TtmEvent они делят с
   *  TTM (ThaiStarX, Ticketmelon, AllTicket). */
  photos?: string[];
  artists: TtmArtist[];
  sourceUrl: string;
};

/** Сколько картинок берём со страницы: у TTM их ровно три (план зала,
 *  бонусы, трансляция), больше — уже баннеры соседних событий. */
export const TTM_MAX_PHOTOS = 3;

/**
 * Картинки «для покупателей»: только /cmsimg/imgeditor/ — это блок
 * контента самого события. Соседние /img_poster/ (афиши других
 * концертов) и /img_seat/ (мелкие превью зон) не берём: первые чужие,
 * вторые нечитаемы.
 *
 * Адреса на сайте бывают с пробелами в имени файла («r 02_… .jpg») —
 * их обязательно кодировать, иначе скачивание падает.
 */
export function parseTtmPhotos(html: string): string[] {
  const found = [...html.matchAll(/<img[^>]+src="([^"]*\/cmsimg\/imgeditor\/[^"]+)"/gi)].map(
    (m) => m[1],
  );
  const seen = new Set<string>();
  const photos: { url: string; order: number }[] = [];
  for (const raw of found) {
    const abs = raw.startsWith("http") ? raw : `https://www.thaiticketmajor.com${raw}`;
    const url = encodeURI(decodeURI(abs));
    if (seen.has(url)) continue;
    seen.add(url);
    // «r 02_Name_SeatPlan.jpg» → 2. Без номера — в конец списка.
    const file = decodeURI(url).split("/").pop() ?? "";
    const num = file.match(/(\d{1,2})[_\s-]/);
    photos.push({ url, order: num ? Number(num[1]) : 99 });
  }
  return photos
    .sort((a, b) => a.order - b.order)
    .slice(0, TTM_MAX_PHOTOS)
    .map((p) => p.url);
}

const MONTH_NAMES_EN = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** Parses "Saturday 22 August 2026, 10:00" into {date, time} strings. */
function parseEnglishDateTime(text: string): { date: string; time: string } | null {
  const match = text.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\D+(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const [, dayStr, monthName, yearStr, hourStr, minuteStr] = match;
  const monthIndex = MONTH_NAMES_EN.indexOf(monthName.toLowerCase());
  if (monthIndex === -1) return null;
  const pad = (n: string | number) => String(n).padStart(2, "0");
  return {
    date: `${yearStr}-${pad(monthIndex + 1)}-${pad(dayStr)}`,
    time: `${pad(hourStr)}:${pad(minuteStr)}`,
  };
}

/**
 * Extracts every day mentioned in a date line like "Saturday 24 - Sunday
 * 25 October 2026" or "Friday 21, Saturday 22 and Sunday 23 August 2026"
 * — any number of day-numbers, all sharing the trailing month/year.
 * Single-day lines ("Saturday 24 October 2026") just return that one day.
 * Returns full "YYYY-MM-DD" strings, sorted, deduped.
 */
function parseDateRangeDays(text: string): string[] {
  const monthYearMatch = text.match(/([A-Za-z]+)\s+(\d{4})\s*$/);
  if (!monthYearMatch || monthYearMatch.index === undefined) return [];

  const [, monthName, yearStr] = monthYearMatch;
  const monthIndex = MONTH_NAMES_EN.indexOf(monthName.toLowerCase());
  if (monthIndex === -1) return [];

  const beforeMonth = text.slice(0, monthYearMatch.index);
  const dayNumbers = [...beforeMonth.matchAll(/\b(\d{1,2})\b/g)].map((m) => parseInt(m[1], 10));
  if (dayNumbers.length === 0) return [];

  const pad = (n: number) => String(n).padStart(2, "0");
  const days = dayNumbers.map((day) => `${yearStr}-${pad(monthIndex + 1)}-${pad(day)}`);
  return [...new Set(days)].sort();
}

// Дедлайн на запрос: у fetch в Node своего таймаута нет, зависший сокет
// держал бы синк афиши бесконечно.
const FETCH_TIMEOUT_MS = 15000;

async function fetchEnglishHtml(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": UA, Cookie: "__la=en" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (e) {
    throw new Error(`${url} -> ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
  }
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

/**
 * Splits one "Artists" row entry into {fullName, nickname}. The site uses
 * two different formats depending on who entered the data, with no shared
 * delimiter:
 *   "Jakrapatr Kaewpanpong (William)"  — full name, nickname in parens
 *   "Earth Pirapat Watthanasetsiri"    — nickname first, then full name
 * The second form is genuinely ambiguous (nothing marks where the
 * nickname ends), so this is a best-effort heuristic (first word =
 * nickname) — callers must let a human confirm/edit before saving.
 */
export function parseArtistLine(raw: string): TtmArtist {
  const text = raw.replace(/\s+/g, " ").trim();

  // Обратная форма «(Ник) Полное Имя» (Love Out Loud 2023 и др.).
  const leadingParen = text.match(/^\(([^)]+)\)\s*(.+)$/);
  if (leadingParen) {
    return { fullName: leadingParen[2].trim(), nickname: leadingParen[1].trim() };
  }

  const parenMatch = text.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (parenMatch) {
    return { fullName: parenMatch[1].trim(), nickname: parenMatch[2].trim() };
  }

  const words = text.split(" ");
  if (words.length >= 2) {
    return { fullName: words.slice(1).join(" "), nickname: words[0] };
  }
  return { fullName: text, nickname: text };
}

/** Текст элемента, разрезанный по <br> (клон — живое дерево не мутируем). */
function htmlToLines($: cheerio.CheerioAPI, el: cheerio.Cheerio<import("domhandler").AnyNode>): string[] {
  const clone = el.clone();
  clone.find("br").replaceWith("\n");
  clone.find("div").prepend("\n");
  return clone
    .text()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function findLabeledRow($: cheerio.CheerioAPI, label: string) {
  return $("tr").filter((_, el) => {
    const firstCellText = $(el).find("td").first().text().replace(/\s+/g, " ").trim();
    return firstCellText.toLowerCase().startsWith(label.toLowerCase());
  });
}

// ------------------------------------------------------- списочные страницы

/** Карточка события на списочной странице (/concert/, /performance/). */
export type TtmListingCard = { url: string; title: string };

/**
 * Канонический адрес страницы события: абсолютный, без utm-хвостов и
 * прочих query-параметров — ключ дедупа краулера (EventDraft.sourceUrl)
 * и сравнения с Event.sourceUrl. null — ссылка не на страницу события
 * TTM (внешние Ticketmaster-карточки, /sport/, служебные страницы).
 */
export function canonicalTtmEventUrl(href: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(href, "https://www.thaiticketmajor.com/");
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "thaiticketmajor.com") return null;
  // Только две категории владельца: концерты и performance (мюзиклы,
  // фанмиты). Разметка списка подмешивает и /sport/, и внешние сайты.
  if (!/^\/(concert|performance)\/[^/]+\.html$/.test(parsed.pathname)) return null;
  return `https://www.thaiticketmajor.com${parsed.pathname}`;
}

/**
 * Разбирает списочную страницу категории. Карточка — `.event-item`, в
 * ней `.box-txt a.title` с адресом и названием (живая разметка на
 * 2026-09: template v3, есть и блок RECOMMENDED с чужими категориями и
 * внешними ссылками — их отсеивает canonicalTtmEventUrl). Ссылки из
 * шапки/уведомлений (`.noti-item`) в `.event-item` не попадают.
 */
export function parseTtmListing(html: string): TtmListingCard[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const cards: TtmListingCard[] = [];
  $(".event-item a.title").each((_, el) => {
    const href = $(el).attr("href");
    const title = $(el).text().replace(/\s+/g, " ").trim();
    if (!href || !title) return;
    const url = canonicalTtmEventUrl(href);
    if (!url || seen.has(url)) return;
    seen.add(url);
    cards.push({ url, title });
  });
  return cards;
}

/** Скачивает и разбирает списочную страницу (тот же UA/кука/таймаут,
 *  что у страниц событий). */
export async function scrapeTtmListing(url: string): Promise<TtmListingCard[]> {
  return parseTtmListing(await fetchEnglishHtml(url));
}

export async function scrapeTtmEvent(url: string): Promise<TtmEvent> {
  const html = await fetchEnglishHtml(url);
  const $ = cheerio.load(html);

  let title = "";
  let venue: string | null = null;
  let posterUrl: string | null = null;
  let date: string | null = null;
  let startTime: string | null = null;

  const ldJson = $("script#json-ld-event, script[type=\"application/ld+json\"]").first().html();
  if (ldJson) {
    try {
      const data = JSON.parse(ldJson);
      title = data.name ?? "";
      venue = data.location?.name ?? null;
      posterUrl = data.image ?? null;
      // "2026-10-24T18:00:00" — no timezone suffix, already Bangkok
      // wall-clock time. String-slice it; don't hand it to `new Date()`.
      const raw: string | undefined = data.startDate;
      if (raw && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) {
        date = raw.slice(0, 10);
        startTime = raw.slice(11, 16);
      }
    } catch {
      // malformed JSON-LD — fields stay at their defaults, the free-text
      // table below still fills in title/venue if this block is unusable
    }
  }

  const dateRow = findLabeledRow($, "Date");
  const dateRangeText = dateRow.find("td").eq(1).text().replace(/\s+/g, " ").trim() || null;
  const rangeDays = dateRangeText ? parseDateRangeDays(dateRangeText) : [];
  const extraDates = date ? rangeDays.filter((d) => d !== date) : rangeDays.slice(1);

  if (!title) {
    title = findLabeledRow($, "Event Title").find("td").eq(1).text().trim();
  }
  if (!venue) {
    venue = findLabeledRow($, "Venue").find("td").eq(1).text().replace(/\s+/g, " ").trim() || null;
  }

  const priceRow = findLabeledRow($, "Ticket Price");
  const ticketPrice = priceRow.find("td").eq(1).text().replace(/\s+/g, " ").trim() || null;

  let presaleDate: string | null = null;
  let presaleTime: string | null = null;
  const publicSaleLabel = $("small").filter((_, el) => $(el).text().trim() === "Public Sale").first();
  const publicSaleText = publicSaleLabel.parent().find("span").first().text().replace(/\s+/g, " ").trim();
  if (publicSaleText) {
    const parsed = parseEnglishDateTime(publicSaleText);
    if (parsed) {
      presaleDate = parsed.date;
      presaleTime = parsed.time;
    }
  }

  // "Artist" (not "Artists") matches both label forms the site uses —
  // some pages say "Artist :" (singular, e.g. weirdo-101-the-first-
  // gravity.html), most say "Artists :". Фестивальные страницы (Love Out
  // Loud Fan Fest) подписывают ту же строку «Performers :», встречается
  // и «Line Up» — берём первую непустую из известных меток.
  let artistsCell = findLabeledRow($, "Artist").find("td").eq(1);
  for (const label of ["Performers", "Performer", "Line Up", "Lineup"]) {
    if (artistsCell.length > 0 && artistsCell.text().trim()) break;
    artistsCell = findLabeledRow($, label).find("td").eq(1);
  }
  // Multiple artists are each wrapped in their own <div>; a single artist
  // is sometimes just bare text directly in the cell with no <div> at
  // all (e.g. gemini-art-venture-concert.html) — fall back to the cell's
  // own text in that case instead of silently returning zero artists.
  // Внутри ячейки/дивов имена разделены <br> и « / » («Name (Nick) /
  // Name (Nick)») — режем и по ним, иначе фестивальный состав слипся бы
  // в одну «строку-артиста».
  // htmlToLines обходит всю ячейку: и голые строки до <div>-блоков, и
  // сами блоки (див получает свой \n) — фестивальные страницы держат
  // часть состава прямо в td, часть в дивах.
  const artistBlocks = htmlToLines($, artistsCell);
  const artists: TtmArtist[] = artistBlocks
    .flatMap((line) => line.split(/\s\/\s/))
    // «LYKN — William Jakrapatr, Lego Rapeepong, …» (riser-concert-the-
    // first-rise): группа — тире — участники через запятую; разворачиваем
    // в отдельных артистов (голову-группу тоже оставляем).
    .flatMap((line) => {
      const dash = line.split(/\s+[—–-]\s+/);
      if (dash.length === 2) {
        // участники бывают обёрнуты в общие скобки: «LYKN — (William …,
        // Tui Chayatorn)» — срезаем их до разбиения по запятым
        const tail = dash[1].trim().replace(/^\(/, "").replace(/\)$/, "");
        return [dash[0], ...tail.split(",")];
      }
      return [line];
    })
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter((text) => text && !/^(tba|special guest)/i.test(text))
    .map(parseArtistLine);

  return {
    title,
    venue,
    posterUrl,
    date,
    startTime,
    extraDates,
    dateRangeText,
    ticketPrice,
    description: null,
    presaleDate,
    presaleTime,
    photos: parseTtmPhotos(html),
    artists,
    sourceUrl: url,
  };
}
