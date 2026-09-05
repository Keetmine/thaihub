import * as cheerio from "cheerio";
import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";

// Парсер musicfestival.in.th — каталога музыкальных фестивалей Таиланда
// (docs/features/musicfestival-import.md). Только чистые функции над
// HTML, без БД (как thaiticketmajor.ts): модуль безопасно импортировать
// и из приложения, и из консольного скрипта.
//
// Сайт — React Router (Remix) с серверным рендером: всё нужное лежит в
// обычной разметке, JS не требуется. Разведка 2026-09:
//  - списки /en/festivals (будущие) и /en/past-festivals (прошедшие) —
//    карточки `<a href="/en/festivals/<слаг>">` с `<h3>` внутри, по 12 на
//    страницу; дальше — тот же адрес с `?offset=12`, `?offset=24`…, а
//    флаг «есть ещё» лежит в loader-данных как `"hasMore",true`;
//  - страница фестиваля /en/festivals/<слаг> — h1, чипы жанров
//    (ссылки /genre/…), дата текстом («16 October 2026»,
//    «12–13 December 2026»), описание (либо один `<p>` с переносами,
//    либо HTML-блок с абзацами), секция Lineup (карточки-ссылки
//    /en/artists/<слаг> с фото и именем; на странице лежит ВЕСЬ состав,
//    кнопка «See all» лишь меняет ленту на сетку), боковая колонка:
//    Venue (название, город, ссылка на Google Maps), Organizer, Tickets
//    (тарифы с ценой в THB + кнопки продавцов), постер — og:image;
//  - страница артиста /en/artists/<слаг> — имя, фото, жанры и списки
//    «Upcoming/Past Shows»; соцсетей и описания на ней нет.

export const MUSIC_FESTIVAL_ORIGIN = "https://www.musicfestival.in.th";
export const MUSIC_FESTIVAL_UPCOMING_URL = `${MUSIC_FESTIVAL_ORIGIN}/en/festivals`;
export const MUSIC_FESTIVAL_PAST_URL = `${MUSIC_FESTIVAL_ORIGIN}/en/past-festivals`;

/** Карточек на одной странице списка (offset шагает на столько же). */
export const MUSIC_FESTIVAL_PAGE_SIZE = 12;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36 MyBLHubImporter/1.0 (personal fan-tracker, contact via site)";

/** Дедлайн на запрос: у fetch в Node своего таймаута нет. */
const FETCH_TIMEOUT_MS = 15000;

// ------------------------------------------------------------------ типы

/** Карточка списка фестивалей. */
export type MusicFestivalCard = {
  /** Канонический адрес английской страницы фестиваля. */
  url: string;
  title: string;
  /** Дата как на карточке («5 September 2026», «29–30 August 2026»). */
  dateText: string | null;
  venue: string | null;
  /** «N artists» на карточке; null — подписи нет. */
  artistCount: number | null;
};

export type MusicFestivalListing = {
  cards: MusicFestivalCard[];
  /** Есть ли следующая страница (`?offset=`) — из loader-данных. */
  hasMore: boolean;
};

/** Артист в лайнапе фестиваля. */
export type MusicFestivalLineupArtist = {
  name: string;
  /** Канонический адрес страницы артиста. */
  url: string;
  /** Абсолютный адрес фото с карточки (то же, что на странице артиста). */
  photoUrl: string | null;
  /** День фестиваля («DAY 2» на карточке, 1-based) — у фестивалей с
   *  расписанием; null — карточка без дня (общий состав). */
  day: number | null;
  /** Слот («18:00-19:00») с той же карточки, как есть. */
  time: string | null;
};

export type MusicFestivalTicketTier = {
  name: string;
  /** Как на сайте: «1,800 THB». */
  price: string;
  /** Примечание под тарифом (рассрочка, дата старта продаж), если есть. */
  note: string | null;
};

export type MusicFestival = {
  title: string;
  sourceUrl: string;
  genres: string[];
  /** Дата текстом, как на странице. */
  dateText: string | null;
  /** Все дни фестиваля «YYYY-MM-DD» (диапазон развёрнут). Времени сайт не
   *  даёт — событие заводится без времени. */
  dates: string[];
  description: string | null;
  posterUrl: string | null;
  /** «N artists» в шапке лайнапа — сверка, что состав снят целиком. */
  lineupCount: number | null;
  lineup: MusicFestivalLineupArtist[];
  /** Расписание по дням (/en/showtime/…), если у фестиваля есть. */
  showtimeUrl: string | null;
  venueName: string | null;
  venueCity: string | null;
  venueMapsUrl: string | null;
  /** Площадка одной строкой для Event.venue: «Название, Город». */
  venue: string | null;
  organizer: string | null;
  tickets: MusicFestivalTicketTier[];
  /** Тарифы одной строкой для Event.ticketPrice:
   *  «Pre Early Bird 690 / Early Bird 990 / General 1,800 THB». */
  ticketPrice: string | null;
  /** Кнопки продавцов билетов (Eventpop, Allticket…), utm-хвосты срезаны.
   *  У прошедших фестивалей кнопка отключена и ссылки нет — url null. */
  ticketLinks: { label: string; url: string | null }[];
};

export type MusicFestivalArtist = {
  name: string;
  sourceUrl: string;
  photoUrl: string | null;
  genres: string[];
  /** «Upcoming Shows» + «Past Shows». */
  festivals: { title: string; url: string; dateText: string | null; venue: string | null }[];
};

// ---------------------------------------------------------------- адреса

function parseSiteUrl(href: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(href, `${MUSIC_FESTIVAL_ORIGIN}/`);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "musicfestival.in.th") return null;
  return parsed;
}

/**
 * Канонический адрес страницы фестиваля: английская версия, абсолютный,
 * без query/hash — ключ дедупа (Event.sourceUrl). Тайская `/festivals/…`
 * и `/th/festivals/…` приводятся к `/en/…`. null — не страница
 * фестиваля (списки, жанры, площадки, чужие сайты).
 */
export function canonicalMusicFestivalUrl(href: string): string | null {
  const parsed = parseSiteUrl(href);
  if (!parsed) return null;
  const m = parsed.pathname.match(/^\/(?:(?:en|th)\/)?festivals\/([^/?#]+)\/?$/);
  if (!m) return null;
  return `${MUSIC_FESTIVAL_ORIGIN}/en/festivals/${m[1]}`;
}

/** То же для страницы артиста (Performer.musicFestivalUrl). */
export function canonicalMusicFestivalArtistUrl(href: string): string | null {
  const parsed = parseSiteUrl(href);
  if (!parsed) return null;
  const m = parsed.pathname.match(/^\/(?:(?:en|th)\/)?artists\/([^/?#]+)\/?$/);
  if (!m) return null;
  return `${MUSIC_FESTIVAL_ORIGIN}/en/artists/${m[1]}`;
}

/** Адрес списка с offset'ом: первая страница — без параметра. */
export function musicFestivalListingPageUrl(listingUrl: string, offset: number): string {
  return offset > 0 ? `${listingUrl}?offset=${offset}` : listingUrl;
}

function absoluteMediaUrl(src: string | undefined): string | null {
  if (!src) return null;
  try {
    return new URL(src, `${MUSIC_FESTIVAL_ORIGIN}/`).toString();
  } catch {
    return null;
  }
}

/** Срезает utm_* у ссылок продавцов билетов — это реферальный хвост
 *  сайта-источника, в нашей карточке ему делать нечего. */
function stripUtm(href: string): string {
  try {
    const u = new URL(href);
    for (const key of [...u.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_")) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return href;
  }
}

// ------------------------------------------------------------------ даты

const MONTHS_EN = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function monthIndex(name: string): number {
  const lower = name.toLowerCase();
  const full = MONTHS_EN.indexOf(lower);
  if (full !== -1) return full;
  // «Sept», «Dec» — на всякий случай по первым трём буквам.
  return MONTHS_EN.findIndex((m) => m.slice(0, 3) === lower.slice(0, 3));
}

function isoDate(y: number, m: number, d: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

/** Потолок развёрнутого диапазона: фестиваль длиннее двух недель —
 *  скорее опечатка на сайте, чем событие. */
const MAX_RANGE_DAYS = 14;

function expandRange(start: [number, number, number], end: [number, number, number]): string[] {
  const from = Date.UTC(start[0], start[1], start[2]);
  const to = Date.UTC(end[0], end[1], end[2]);
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return [isoDate(...start)];
  const days: string[] = [];
  for (let t = from; t <= to && days.length < MAX_RANGE_DAYS; t += 24 * 60 * 60 * 1000) {
    const d = new Date(t);
    days.push(isoDate(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  return days;
}

/**
 * Разворачивает дату фестиваля в список дней «YYYY-MM-DD». Формы с
 * сайта: «16 October 2026», «12–13 December 2026», «31 October – 2
 * November 2026», «30 December 2026 – 1 January 2027» (дефис, короткое
 * и длинное тире — равнозначны). Диапазон разворачивается ЦЕЛИКОМ
 * (фестиваль идёт подряд), не только края. Пусто — дата не разобралась.
 */
export function parseMusicFestivalDates(text: string | null | undefined): string[] {
  if (!text) return [];
  const t = text.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();

  // «30 December 2026 - 1 January 2027»
  let m = t.match(/^(\d{1,2}) ([A-Za-z]+) (\d{4}) ?- ?(\d{1,2}) ([A-Za-z]+) (\d{4})$/);
  if (m) {
    const [, d1, mo1, y1, d2, mo2, y2] = m;
    const a = monthIndex(mo1);
    const b = monthIndex(mo2);
    if (a === -1 || b === -1) return [];
    return expandRange([+y1, a, +d1], [+y2, b, +d2]);
  }
  // «31 October - 2 November 2026»
  m = t.match(/^(\d{1,2}) ([A-Za-z]+) ?- ?(\d{1,2}) ([A-Za-z]+) (\d{4})$/);
  if (m) {
    const [, d1, mo1, d2, mo2, y] = m;
    const a = monthIndex(mo1);
    const b = monthIndex(mo2);
    if (a === -1 || b === -1) return [];
    // Начало в декабре, конец в январе — год начала на единицу меньше.
    const y1 = a > b ? +y - 1 : +y;
    return expandRange([y1, a, +d1], [+y, b, +d2]);
  }
  // «12-13 December 2026»
  m = t.match(/^(\d{1,2}) ?- ?(\d{1,2}) ([A-Za-z]+) (\d{4})$/);
  if (m) {
    const [, d1, d2, mo, y] = m;
    const a = monthIndex(mo);
    if (a === -1) return [];
    return expandRange([+y, a, +d1], [+y, a, +d2]);
  }
  // «16 October 2026»
  m = t.match(/^(\d{1,2}) ([A-Za-z]+) (\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const a = monthIndex(mo);
    if (a === -1) return [];
    return [isoDate(+y, a, +d)];
  }
  return [];
}

// ----------------------------------------------------------------- helpers

function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** «Листовой» div — текстовая строка карточки: детей-элементов нет,
 *  кроме svg-иконки перед текстом (календарь, булавка). */
function isLeafBlock($: CheerioAPI, el: AnyNode): boolean {
  return $(el).children().not("svg").length === 0;
}

/** Многострочный текст блока: <br>, абзацы и пункты списка — переносы,
 *  остальное схлопывается. Нужен описанию: оно бывает и одним `<p>` с
 *  переносами (whitespace-pre-line), и HTML-блоком из абзацев. */
function blockToText($: CheerioAPI, el: Cheerio<AnyNode>): string {
  const clone = el.clone();
  clone.find("br").replaceWith("\n");
  clone.find("li").each((_, li) => {
    $(li).prepend("\n• ");
  });
  clone.find("p, div, ul, ol, h1, h2, h3, h4").each((_, block) => {
    $(block).prepend("\n").append("\n");
  });
  return clone
    .text()
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Заголовок блока боковой колонки («Venue», «Tickets», «Organizer») →
 *  сам блок: у Venue h3 завёрнут в лишний flex-div (вместе с
 *  svg-иконкой), у Tickets лежит прямо в блоке — поднимаемся, пока в
 *  родителе не появится содержимое (ссылки/абзацы/строки тарифов). */
function asideBlock($: CheerioAPI, label: string): Cheerio<AnyNode> | null {
  const h3 = $("aside h3")
    .filter((_, el) => cleanText($(el).text()).toLowerCase() === label.toLowerCase())
    .first();
  if (h3.length === 0) return null;
  let block = h3.parent();
  while (block.length && !block.is("aside") && block.find("a, p, div").length === 0) {
    block = block.parent();
  }
  return block.length && !block.is("aside") ? block : null;
}

function ogContent($: CheerioAPI, property: string): string | null {
  const c = $(`meta[property="${property}"]`).attr("content");
  return c ? c.trim() : null;
}

/** og:image у страниц без своей картинки — общая заглушка сайта. */
function isGenericOgImage(url: string | null): boolean {
  return !url || /\/og-image\.(jpg|png|webp)$/i.test(url);
}

// --------------------------------------------------------------- списки

/**
 * Разбирает страницу списка (будущие или прошедшие). Карточка — ссылка
 * на страницу фестиваля с `<h3>` внутри; ссылки шапки/футера и «TH»
 * без заголовка отсеиваются сами. `hasMore` — из loader-данных React
 * Router в разметке (`"hasMore",true`); если строки нет — считаем, что
 * страница последняя, когда карточек меньше полной страницы.
 */
export function parseMusicFestivalListing(html: string): MusicFestivalListing {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const cards: MusicFestivalCard[] = [];

  $('main a[href*="/festivals/"]').each((_, el) => {
    const a = $(el);
    const h3 = a.find("h3").first();
    if (h3.length === 0) return;
    const url = canonicalMusicFestivalUrl(a.attr("href") ?? "");
    const title = cleanText(h3.text());
    if (!url || !title || seen.has(url)) return;
    seen.add(url);

    const lines = a
      .find("p")
      .map((_, p) => cleanText($(p).text()))
      .get()
      .filter(Boolean);
    const countLine = lines.find((l) => /^\d+\s+artists?$/i.test(l));
    const dateLine = lines.find((l) => parseMusicFestivalDates(l).length > 0) ?? null;
    const venueLine = lines.find((l) => l !== countLine && l !== dateLine) ?? null;
    cards.push({
      url,
      title,
      dateText: dateLine,
      venue: venueLine,
      artistCount: countLine ? parseInt(countLine, 10) : null,
    });
  });

  const flag = html.match(/\\"hasMore\\",(true|false)/);
  const hasMore = flag ? flag[1] === "true" : cards.length >= MUSIC_FESTIVAL_PAGE_SIZE;
  return { cards, hasMore };
}

// ------------------------------------------------------- страница фестиваля

export function parseMusicFestivalPage(html: string, url: string): MusicFestival {
  const $ = cheerio.load(html);
  const sourceUrl = canonicalMusicFestivalUrl(url) ?? url;

  const h1 = $("main h1").first();
  let title = cleanText(h1.text());
  if (!title) {
    title = cleanText(ogContent($, "og:title") ?? "").replace(/\s*\|\s*musicfestival\.in\.th$/i, "");
  }

  // Шапка: h1, чипы жанров и дата — в одном div. Чип «Edition: 2026»
  // (span.tag) жанром не является: жанры — только ссылки /genre/.
  const head = h1.parent();
  const genres = [
    ...new Set(
      head
        .find('a[href*="/genre/"]')
        .map((_, el) => cleanText($(el).text()))
        .get()
        .filter(Boolean),
    ),
  ];
  const dateText =
    head
      .find("p")
      .map((_, el) => cleanText($(el).text()))
      .get()
      .find((t) => parseMusicFestivalDates(t).length > 0) ?? null;
  const dates = parseMusicFestivalDates(dateText);

  // Описание — первая секция после шапки без своего заголовка (у
  // Lineup/Gallery заголовок h2 есть).
  let description: string | null = null;
  const descSection = head
    .nextAll("section")
    .filter((_, el) => $(el).find("h2").length === 0)
    .first();
  if (descSection.length) {
    description = blockToText($, descSection) || null;
  }

  let posterUrl = ogContent($, "og:image");
  if (isGenericOgImage(posterUrl)) {
    posterUrl = absoluteMediaUrl($('main img[fetchpriority="high"], main img[fetchPriority="high"]').first().attr("src"));
  }

  // Лайнап: секция с h2 «Lineup». Карточки — ссылки на артистов; имя —
  // подпись внутри карточки (последний div), фото — img карточки.
  const lineup: MusicFestivalLineupArtist[] = [];
  let lineupCount: number | null = null;
  let showtimeUrl: string | null = null;
  const lineupH2 = $("main h2")
    .filter((_, el) => cleanText($(el).text()).toLowerCase() === "lineup")
    .first();
  if (lineupH2.length) {
    const section = lineupH2.closest("section");
    const countText = section
      .find("span")
      .map((_, el) => cleanText($(el).text()))
      .get()
      .find((t) => /^\d+\s+artists?$/i.test(t));
    lineupCount = countText ? parseInt(countText, 10) : null;
    const showtime = section.find('a[href*="/showtime/"]').first().attr("href");
    showtimeUrl = showtime ? absoluteMediaUrl(showtime) : null;

    const seen = new Set<string>();
    section.find('a[href*="/artists/"]').each((_, el) => {
      const a = $(el);
      const artistUrl = canonicalMusicFestivalArtistUrl(a.attr("href") ?? "");
      if (!artistUrl || seen.has(artistUrl)) return;
      const img = a.find("img").first();
      // Строки карточки: имя (подпись поверх фото) и — у фестивалей с
      // расписанием — «DAY N» и слот времени под ней.
      const lines = a
        .find("div")
        .filter((_, d) => isLeafBlock($, d))
        .map((_, d) => cleanText($(d).text()))
        .get()
        .filter(Boolean);
      const dayLine = lines.find((l) => /^day\s*\d+$/i.test(l));
      const timeLine = lines.find((l) => /^\d{1,2}:\d{2}/.test(l));
      const name =
        cleanText(img.attr("alt") ?? "") ||
        lines.find((l) => l !== dayLine && l !== timeLine) ||
        "";
      if (!name) return;
      seen.add(artistUrl);
      lineup.push({
        name,
        url: artistUrl,
        photoUrl: absoluteMediaUrl(img.attr("src")),
        day: dayLine ? parseInt(dayLine.replace(/\D/g, ""), 10) : null,
        time: timeLine ?? null,
      });
    });
  }

  // Боковая колонка.
  let venueName: string | null = null;
  let venueCity: string | null = null;
  let venueMapsUrl: string | null = null;
  const venueBlock = asideBlock($, "Venue");
  if (venueBlock) {
    venueName = cleanText(venueBlock.find('a[href*="/venues/"]').first().text()) || null;
    if (!venueName) {
      venueName = cleanText(venueBlock.find("a, .font-semibold").first().text()) || null;
    }
    venueCity = cleanText(venueBlock.find("p").first().text()) || null;
    venueMapsUrl = venueBlock.find('a[target="_blank"]').first().attr("href") ?? null;
  }
  const venue = [venueName, venueCity].filter(Boolean).join(", ") || null;

  const organizerBlock = asideBlock($, "Organizer");
  const organizer = organizerBlock ? cleanText(organizerBlock.find("a").first().text()) || null : null;

  const tickets: MusicFestivalTicketTier[] = [];
  const ticketLinks: { label: string; url: string | null }[] = [];
  const ticketsBlock = asideBlock($, "Tickets");
  if (ticketsBlock) {
    ticketsBlock.children("div").each((_, el) => {
      const row = $(el);
      const cells = row.children("div");
      if (cells.length < 2) return;
      const nameCell = cells.first();
      const name = cleanText(nameCell.children("div").first().text()) || cleanText(nameCell.text());
      const note = cleanText(nameCell.children("div").eq(1).text()) || null;
      const price = cleanText(cells.last().text());
      if (!name || !price) return;
      tickets.push({ name, price, note });
    });
    ticketsBlock.find('a[target="_blank"], span.btn-orange').each((_, el) => {
      const href = $(el).attr("href") ?? null;
      const label = cleanText($(el).text());
      if (!href && !label) return;
      ticketLinks.push({ label: label || href!, url: href ? stripUtm(href) : null });
    });
  }

  return {
    title,
    sourceUrl,
    genres,
    dateText,
    dates,
    description,
    posterUrl,
    lineupCount,
    lineup,
    showtimeUrl,
    venueName,
    venueCity,
    venueMapsUrl,
    venue,
    organizer,
    tickets,
    ticketPrice: formatTicketPrice(tickets),
    ticketLinks,
  };
}

/**
 * Тарифы одной строкой для свободного поля Event.ticketPrice: «Pre Early
 * Bird 690 / Early Bird 990 / General 1,800 THB» — валюта один раз в
 * конце, если у всех тарифов она одна. Примечания (рассрочка, дата
 * старта) в строку не идут.
 */
export function formatTicketPrice(tickets: MusicFestivalTicketTier[]): string | null {
  if (tickets.length === 0) return null;
  const currencies = new Set<string>();
  const parts = tickets.map((t) => {
    const m = t.price.match(/^([\d.,]+)\s*([A-Za-z฿]+)$/);
    if (m) {
      currencies.add(m[2]);
      return `${t.name} ${m[1]}`;
    }
    return `${t.name} ${t.price}`;
  });
  const sameCurrency = currencies.size === 1 && parts.length === tickets.length;
  const allParsed = tickets.every((t) => /^([\d.,]+)\s*([A-Za-z฿]+)$/.test(t.price));
  return sameCurrency && allParsed ? `${parts.join(" / ")} ${[...currencies][0]}` : parts.join(" / ");
}

// --------------------------------------------------------- страница артиста

export function parseMusicFestivalArtist(html: string, url: string): MusicFestivalArtist {
  const $ = cheerio.load(html);
  const sourceUrl = canonicalMusicFestivalArtistUrl(url) ?? url;
  const h1 = $("main h1").first();
  let name = cleanText(h1.text());
  if (!name) {
    name = cleanText(ogContent($, "og:title") ?? "").replace(/\s*\|\s*musicfestival\.in\.th$/i, "");
  }

  // Фото — картинка шапки (alt = имя); у артиста без фото на её месте
  // серый квадрат, а og:image — общая заглушка сайта.
  let photoUrl = absoluteMediaUrl(
    $("main img")
      .filter((_, el) => cleanText($(el).attr("alt") ?? "") === name)
      .first()
      .attr("src"),
  );
  if (!photoUrl) {
    const og = ogContent($, "og:image");
    photoUrl = isGenericOgImage(og) ? null : og;
  }

  const genres = [
    ...new Set(
      $('main a[href*="/genre/"]')
        .map((_, el) => cleanText($(el).text()))
        .get()
        .filter(Boolean),
    ),
  ];

  const festivals: MusicFestivalArtist["festivals"] = [];
  $('main a[href*="/festivals/"]').each((_, el) => {
    const a = $(el);
    const festUrl = canonicalMusicFestivalUrl(a.attr("href") ?? "");
    if (!festUrl) return;
    const lines = a
      .find("div")
      .filter((_, d) => isLeafBlock($, d))
      .map((_, d) => cleanText($(d).text()))
      .get()
      .filter(Boolean);
    const title = lines[0] ?? cleanText(a.find("img").attr("alt") ?? "");
    if (!title) return;
    const dateText = lines.find((l) => parseMusicFestivalDates(l).length > 0) ?? null;
    const venue = lines.find((l) => l !== title && l !== dateText && !/^\d{1,2}:\d{2}/.test(l)) ?? null;
    festivals.push({ title, url: festUrl, dateText, venue });
  });

  return { name, sourceUrl, photoUrl, genres, festivals };
}

// ---------------------------------------------------------------- сеть

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

export async function scrapeMusicFestivalListing(url: string): Promise<MusicFestivalListing> {
  return parseMusicFestivalListing(await fetchHtml(url));
}

export async function scrapeMusicFestivalPage(url: string): Promise<MusicFestival> {
  return parseMusicFestivalPage(await fetchHtml(url), url);
}

export async function scrapeMusicFestivalArtist(url: string): Promise<MusicFestivalArtist> {
  return parseMusicFestivalArtist(await fetchHtml(url), url);
}
