import { scrapeTtmEvent, type TtmEvent } from "./thaiticketmajor";

// Импорт события «по любой ссылке»: одно поле в админке, сайт
// распознаётся по домену (просьба владельца). Каждый парсер приводит
// свой сайт к TtmEvent — форме, которую уже понимает экран проверки
// TTM-импорта: другого результата у него и не бывает, а «лишние» для
// этих сайтов поля (артисты, предпродажа) остаются пустыми — состав
// на них не размечен, админ добирает руками на том же экране.
//
// Что и как отдаёт каждый сайт — из разведки 2026-08-28
// (docs/features/events.md, «Импорт по ссылке»):
//  - ticketmelon.com — весь ивент лежит готовым JSON в __NEXT_DATA__;
//  - allticket.com — открытый статический JSON
//    /master/event_info/<слаг>.json (их живой API за AWS WAF, но
//    master-файл отдаётся без защиты);
//  - eventpop.me — обычный серверный HTML: og-меты + контент
//    организатора; структурированных дат нет, дата достаётся из
//    текста, время admin ставит руками;
//  - ticket.eventpass.co — Next.js flight-поток (self.__next_f);
//    вход пускает только с кукой allowed-user=true, которую сайт сам
//    ставит редиректом — шлём её сразу;
//  - tickets-easy.com — перепродавец с афишей по странам: карточка
//    каталога и страница события отдают обычный HTML; время сайта
//    ненадёжно и не берётся (см. lib/ticketsEasy.ts);
//  - theconcert.com — НЕ парсится: Cloudflare-челлендж не решается ни
//    curl, ни playwright (headless и с окном — проверено циклом как у
//    MdlClient), их защита распознаёт автоматизацию. Отбиваем понятным
//    сообщением, а не таймаутом.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36 MyBLHubImporter/1.0 (personal fan-tracker, contact via site)";

export type EventTicketSite =
  | "thaiticketmajor"
  | "eventpop"
  | "ticketmelon"
  | "allticket"
  | "eventpass"
  | "ticketseasy"
  | "theconcert";

export const SUPPORTED_EVENT_SITES_LABEL =
  "ThaiTicketMajor, Eventpop, Ticketmelon, AllTicket, Eventpass, tickets-easy";

/** Сайт по домену ссылки; null — домен не из известных. */
/** Хост ссылки без www — null у мусора вместо адреса. */
function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function detectEventSite(url: string): EventTicketSite | null {
  const host = hostOf(url);
  if (host === null) return null;
  if (host.endsWith("thaiticketmajor.com")) return "thaiticketmajor";
  if (host.endsWith("eventpop.me")) return "eventpop";
  if (host.endsWith("ticketmelon.com")) return "ticketmelon";
  if (host.endsWith("allticket.com")) return "allticket";
  if (host.endsWith("eventpass.co")) return "eventpass";
  if (host.endsWith("tickets-easy.com")) return "ticketseasy";
  if (host.endsWith("theconcert.com")) return "theconcert";
  return null;
}

/** Одна точка входа для экрана импорта: распознать сайт и спарсить. */
export async function scrapeEventByUrl(url: string): Promise<TtmEvent> {
  switch (detectEventSite(url)) {
    case "thaiticketmajor":
      return scrapeTtmEvent(url);
    case "eventpop":
      return scrapeEventpop(url);
    case "ticketmelon":
      return scrapeTicketmelon(url);
    case "allticket":
      return scrapeAllticket(url);
    case "eventpass":
      return scrapeEventpass(url);
    case "ticketseasy": {
      // Перепродавец: дата и площадка есть, времени нет намеренно —
      // см. шапку lib/ticketsEasy.ts.
      const { scrapeTicketsEasyEvent } = await import("@/lib/ticketsEasy");
      return scrapeTicketsEasyEvent(url);
    }
    case "theconcert":
      throw new Error(
        "theconcert.com закрыт Cloudflare-проверкой, которую не проходит даже браузер-автомат — это событие придётся завести руками",
      );
    default:
      // У фестивалей musicfestival.in.th свой импорт — с составом,
      // расписанием по сценам и заготовками исполнителей; экран
      // билетных сайтов их не потянет, поэтому не «не узнаю сайт», а
      // куда идти (жалоба владельца 2026-09-06).
      if (/(^|\.)musicfestival\.in\.th$/.test(hostOf(url) ?? "")) {
        throw new Error(
          "Фестивали musicfestival.in.th импортируются своей карточкой на этой же " +
            "странице — «Фестивали musicfestival.in.th», поле «Фестиваль по ссылке»",
        );
      }
      throw new Error(`Не узнаю сайт — поддерживаются: ${SUPPORTED_EVENT_SITES_LABEL}`);
  }
}

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "en,th", ...headers },
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

/** HTML → текст с абзацами: <p>/<br> становятся переводами строк.
 *  <style>/<script> выбрасываются ЦЕЛИКОМ: у AllTicket описание
 *  начинается со <style>, и его CSS сочился бы в текст. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    // служебные маркеры ticketmelon в тексте организатора
    .replace(/\[LANGUAGE_CHECK_[A-Z]+\]/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "’")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function metaContent(html: string, property: string): string | null {
  const m = html.match(
    new RegExp(`<meta[^>]+(?:property|name)="${property}"[^>]+content="([^"]*)"`, "i"),
  );
  const value = m?.[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
  return value || null;
}

const MONTHS_EN = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** Месяц по началу слова: сайты пишут и «OCT», и «SEPTEBER» (опечатка
 *  в живых данных AllTicket) — точное совпадение бы их упустило. */
function monthIndexLoose(word: string): number {
  const lower = word.toLowerCase();
  return MONTHS_EN.findIndex((m) => m.startsWith(lower.slice(0, 3)) && lower.length >= 3);
}

/**
 * Все дни из строки вида «12-14 APRIL 2026», «5, 19, 26 SEPTEBER 2026»
 * или «31 OCTOBER 2026»: числа перед месяцем — список дней, диапазон
 * через тире разворачивается ЦЕЛИКОМ (у TTM-разборщика «12-14» дало бы
 * только 12 и 14 — для трёхдневного фестиваля это потеря дня).
 * Возвращает "YYYY-MM-DD", отсортированные без повторов.
 */
export function parseLooseDateList(text: string): string[] {
  const m = text.match(/([0-9,\s–—-]*\d)\s*([A-Za-z]{3,})\.?\s*,?\s*(\d{4})/);
  if (!m) return [];
  const [, daysPart, monthWord, yearStr] = m;
  const monthIndex = monthIndexLoose(monthWord);
  if (monthIndex === -1) return [];
  const year = Number(yearStr);

  const days = new Set<number>();
  for (const range of daysPart.matchAll(/(\d{1,2})\s*[–—-]\s*(\d{1,2})/g)) {
    const from = Number(range[1]);
    const to = Number(range[2]);
    for (let d = Math.min(from, to); d <= Math.max(from, to) && d - from < 31; d++) days.add(d);
  }
  const withoutRanges = daysPart.replace(/(\d{1,2})\s*[–—-]\s*(\d{1,2})/g, " ");
  for (const single of withoutRanges.matchAll(/\d{1,2}/g)) days.add(Number(single[0]));

  const pad = (n: number) => String(n).padStart(2, "0");
  return [...days]
    .filter((d) => d >= 1 && d <= 31)
    .sort((a, b) => a - b)
    .map((d) => `${year}-${pad(monthIndex + 1)}-${pad(d)}`);
}

/** Инстант (мс) → бангкокские настенные дата и время строками — в том
 *  же виде «не трогаем new Date для настенного», что и весь импорт. */
function bangkokWallParts(ms: number): { date: string; time: string } {
  const iso = new Date(ms + 7 * 3600_000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/** Все календарные дни между двумя датами включительно (потолок — чтобы
 *  кривой конец «через год» не породил сотни дат). */
function daySpan(fromDate: string, toDate: string, cap = 31): string[] {
  const out: string[] = [];
  const cursor = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`).getTime();
  while (cursor.getTime() <= end && out.length < cap) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function emptyEvent(sourceUrl: string): TtmEvent {
  return {
    title: "",
    venue: null,
    posterUrl: null,
    date: null,
    startTime: null,
    extraDates: [],
    dateRangeText: null,
    ticketPrice: null,
    description: null,
    presaleDate: null,
    presaleTime: null,
    artists: [],
    sourceUrl,
  };
}

// ---------------------------------------------------------------- eventpop

/**
 * Дат в разметке eventpop нет вовсе (расписание дорисовывает клиент) —
 * дата выуживается из текста организатора («31 OCTOBER 2026 I UOB
 * LIVE»), время админ ставит руками на экране проверки.
 */
export function parseEventpopHtml(html: string, sourceUrl: string): TtmEvent {
  const event = emptyEvent(sourceUrl);
  event.title = (metaContent(html, "og:title") ?? "").replace(/^Eventpop\s*\|\s*/i, "").trim();
  event.posterUrl = metaContent(html, "og:image");
  event.venue = metaContent(html, "og:location");

  // Контент организатора — самый длинный сплошной прогон <p>-абзацев
  // (обёртки без опознавательных классов). Он же кормит поиск даты.
  const paragraphs = [...html.matchAll(/<p[^>]*>[\s\S]*?<\/p>/g)];
  let run: { text: string; length: number } = { text: "", length: 0 };
  let current: string[] = [];
  let currentEnd = -1;
  const flush = () => {
    const text = htmlToText(current.join("\n"));
    if (text.length > run.length) run = { text, length: text.length };
    current = [];
  };
  for (const p of paragraphs) {
    if (currentEnd >= 0 && p.index! - currentEnd > 400) flush();
    current.push(p[0]);
    currentEnd = p.index! + p[0].length;
  }
  flush();
  const description = run.text || htmlToText(metaContent(html, "og:description") ?? "");
  event.description = description.slice(0, 4000) || null;

  const days = parseLooseDateList(description);
  if (days.length === 0 && metaContent(html, "og:description")) {
    days.push(...parseLooseDateList(metaContent(html, "og:description")!));
  }
  if (days.length > 0) {
    event.date = days[0];
    event.extraDates = days.slice(1);
  }
  return event;
}

async function scrapeEventpop(url: string): Promise<TtmEvent> {
  return parseEventpopHtml(await fetchText(url), url);
}

// -------------------------------------------------------------- ticketmelon

export function parseTicketmelonHtml(html: string, sourceUrl: string): TtmEvent {
  const event = emptyEvent(sourceUrl);
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error("ticketmelon: на странице нет __NEXT_DATA__ — вёрстка поменялась?");
  const data = JSON.parse(m[1]) as {
    props?: { pageProps?: { event?: Record<string, unknown> } };
  };
  const ev = data.props?.pageProps?.event;
  if (!ev) throw new Error("ticketmelon: в __NEXT_DATA__ нет события — не страница ли это списка?");

  const str = (k: string) => (typeof ev[k] === "string" ? (ev[k] as string).trim() : "");
  event.title = str("name") || (metaContent(html, "og:title") ?? "");
  const venue = ev.venue as { name?: string } | undefined;
  event.venue = venue?.name?.trim() || null;
  event.posterUrl =
    [1, 2, 3, 4, 5].map((i) => str(`header_image_${i}`)).find(Boolean) ??
    metaContent(html, "og:image");
  if (str("description")) event.description = htmlToText(str("description")).slice(0, 4000);

  // show_starttime/show_endtime — инстанты (мс); «start»/«end» — окно
  // продаж, у части событий start вовсе 0.
  const startMs = typeof ev.show_starttime === "number" ? ev.show_starttime : 0;
  const endMs = typeof ev.show_endtime === "number" ? ev.show_endtime : 0;
  if (startMs > 0) {
    const start = bangkokWallParts(startMs);
    event.date = start.date;
    event.startTime = start.time;
    if (endMs > startMs) {
      event.extraDates = daySpan(start.date, bangkokWallParts(endMs).date).slice(1);
    }
  }
  return event;
}

async function scrapeTicketmelon(url: string): Promise<TtmEvent> {
  return parseTicketmelonHtml(await fetchText(url), url);
}

/** То из __NEXT_DATA__, что нужно КРАУЛЕРУ (src/lib/ticketSiteCrawl.ts),
 *  а экрану импорта — нет: рубрики, статус публикации, момент начала и
 *  слаги. Отдельная функция, чтобы не раздувать TtmEvent полями одного
 *  сайта. Не страница события (организатор, список) — null. */
export type TicketmelonEventMeta = {
  categories: string[];
  status: string | null;
  isActive: boolean;
  /** Инстант начала шоу (мс) или null, если сайт его не дал. */
  showStartMs: number | null;
  eoSlug: string | null;
  slug: string | null;
};

export function parseTicketmelonEventMeta(html: string): TicketmelonEventMeta | null {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  let ev: Record<string, unknown> | undefined;
  try {
    ev = (JSON.parse(m[1]) as { props?: { pageProps?: { event?: Record<string, unknown> } } }).props?.pageProps?.event;
  } catch {
    return null;
  }
  if (!ev) return null;
  const str = (k: string) => (typeof ev[k] === "string" ? (ev[k] as string).trim() || null : null);
  return {
    categories: Array.isArray(ev.categories) ? ev.categories.filter((c): c is string => typeof c === "string") : [],
    status: str("status"),
    isActive: ev.is_active !== false,
    showStartMs: typeof ev.show_starttime === "number" && ev.show_starttime > 0 ? ev.show_starttime : null,
    eoSlug: str("eo_slug"),
    slug: str("slug"),
  };
}

/** Страница события Ticketmelon целиком — для краулера: и TtmEvent, и мета. */
export async function scrapeTicketmelonForCrawl(url: string): Promise<{ event: TtmEvent; meta: TicketmelonEventMeta | null }> {
  const html = await fetchText(url);
  return { event: parseTicketmelonHtml(html, url), meta: parseTicketmelonEventMeta(html) };
}

// --------------------------------------------------------------- allticket

type AllticketInfo = {
  event_full_name?: string;
  event_name?: string;
  event_location?: string;
  event_logo?: string;
  event_show_date?: string;
  event_show_time?: string;
  event_show_price?: string;
  infoHtml?: string;
  infoHtmlEN?: string;
};

export function parseAllticketInfo(info: AllticketInfo, sourceUrl: string): TtmEvent {
  const event = emptyEvent(sourceUrl);
  event.title = (info.event_full_name || info.event_name || "").trim();
  event.venue = info.event_location?.replace(/\s*\.\s*$/, "").trim() || null;
  event.posterUrl = info.event_logo?.trim() || null;
  event.ticketPrice = info.event_show_price?.trim() || null;

  const time = info.event_show_time?.match(/\d{1,2}:\d{2}/)?.[0] ?? null;
  const days = info.event_show_date ? parseLooseDateList(info.event_show_date) : [];
  if (days.length > 0) {
    event.date = days[0];
    event.extraDates = days.slice(1);
    event.startTime = time ? time.padStart(5, "0") : null;
  }
  event.description =
    htmlToText(info.infoHtmlEN?.trim() || info.infoHtml?.trim() || "").slice(0, 4000) || null;
  event.dateRangeText = info.event_show_date?.trim() || null;
  return event;
}

export async function scrapeAllticket(url: string): Promise<TtmEvent> {
  const slug = new URL(url).pathname.match(/\/event\/([^/]+)/)?.[1];
  if (!slug) throw new Error("allticket: в ссылке нет /event/<код события>");
  const body = await fetchText(
    `https://www.allticket.com/master/event_info/${encodeURIComponent(slug)}.json`,
  );
  const parsed = JSON.parse(body) as { data?: AllticketInfo };
  if (!parsed.data) throw new Error("allticket: событие не нашлось (пустой master-файл)");
  return parseAllticketInfo(parsed.data, url);
}

// --------------------------------------------------------------- eventpass

/** Достать из flight-потока строковое значение по экранированному
 *  ключу: \"key\":\"value\". Значение расэкранируется как JSON. */
function flightString(html: string, key: string): string | null {
  const m = html.match(new RegExp(`\\\\"${key}\\\\":\\\\"((?:[^"\\\\]|\\\\.)*?)\\\\"`));
  if (!m) return null;
  try {
    return (JSON.parse(`"${m[1].replace(/\\\\/g, "\\")}"`) as string).trim() || null;
  } catch {
    return m[1].trim() || null;
  }
}

/**
 * Даты у них лежат ISO-строками с фиктивным «Z» — «2026-10-24T15:00Z»
 * при витринной надписи «24 - 25 ต.ค. 2569» значит настенные 15:00, а
 * не 22:00 по Бангкоку. Режем строкой, как весь остальной импорт.
 */
export function parseEventpassHtml(html: string, sourceUrl: string): TtmEvent {
  const event = emptyEvent(sourceUrl);
  const nameBlock = html.match(/\\"name\\":\{\\"th\\":\\"((?:[^"\\]|\\.)*?)\\",\\"en\\":\\"((?:[^"\\]|\\.)*?)\\"/);
  const unescape = (raw: string): string => {
    try {
      return JSON.parse(`"${raw.replace(/\\\\/g, "\\")}"`) as string;
    } catch {
      return raw;
    }
  };
  event.title = (nameBlock ? unescape(nameBlock[2]) || unescape(nameBlock[1]) : "").trim();
  event.venue = flightString(html, "venueName");
  event.posterUrl = flightString(html, "eventLogo") ?? flightString(html, "eventBanner");
  event.dateRangeText = flightString(html, "date");

  const startIso = flightString(html, "eventStartDate");
  const endIso = flightString(html, "eventEndDate");
  if (startIso && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(startIso)) {
    event.date = startIso.slice(0, 10);
    event.startTime = startIso.slice(11, 16);
    if (endIso && /^\d{4}-\d{2}-\d{2}/.test(endIso)) {
      event.extraDates = daySpan(event.date, endIso.slice(0, 10)).slice(1);
    }
  }
  return event;
}

async function scrapeEventpass(url: string): Promise<TtmEvent> {
  // Вход стерегут кукой: без неё сайт отвечает редиректом на самого
  // себя, ставя allowed-user=true. Значение статичное — шлём сразу.
  const html = await fetchText(url, { Cookie: "allowed-user=true" });
  return parseEventpassHtml(html, url);
}
