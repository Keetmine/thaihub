import type { TtmEvent } from "@/lib/thaiticketmajor";
import { decodeHtmlEntities } from "@/lib/eventDedupe";

/**
 * tickets-easy.com — перепродавец билетов с афишей по странам (просьба
 * владельца 2026-09-22: «есть сайт с афишами и билетами, давай тоже
 * парсить, только тайландские»).
 *
 * Устройство простое: каталог фильтруется параметром `city` (страна там
 * тоже «город»), пагинации нет вовсе — вся тайская афиша умещается на
 * одной странице, `page=2` отдаёт ту же. Карточка каталога несёт всё
 * сразу: адрес события, постер, категорию, страну, дату, название,
 * площадку и «от какой цены». Страница события добавляет список сессий
 * — по нему берутся остальные дни многодневника.
 *
 * ВРЕМЯ НЕ БЕРЁМ. Сайт подписывает время как «HKT», но это не перевод в
 * гонконгскую зону, а просто подпись: сверка с нашими записями из
 * ThaiTicketMajor и AllTicket дала три разных расхождения на четырёх
 * событиях — 0, +1 и +3 часа (проверено 2026-09-22 на NAMTAN FILM,
 * NuNew, LINGORM и OH MY FOURTH). Единого сдвига нет, значит и
 * пересчитать нельзя: черновик получает дату без времени, а заявленное
 * сайтом время едет в описании — админ проставит его руками, сверившись
 * с официальной страницей.
 *
 * Карточки с приставкой 【Purchasing Service】 — не отдельные события, а
 * услуга выкупа того же концерта: в очередь не идут.
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36 MyBLHubImporter/1.0 (personal fan-tracker, contact via site)";

const FETCH_TIMEOUT_MS = 20000;

/** Тайская афиша целиком: страна фильтром, все категории. */
export const TICKETS_EASY_THAILAND_URL =
  "https://tickets-easy.com/en/module/ticketseasy/catalog?q=&city=Thailand&date=";

/** Страна, события которой берём. Сайт пишет её первым словом в
 *  строке-мете карточки. */
export const TICKETS_EASY_COUNTRY = "Thailand";

export type TicketsEasyCard = {
  url: string;
  title: string;
  venue: string | null;
  /** «Thailand» — страна карточки, по ней и фильтруем. */
  country: string | null;
  /** «YYYY-MM-DD» из строки-меты. */
  date: string | null;
  /** «18:00» — как подписано на сайте. В событие НЕ идёт, см. шапку. */
  claimedTime: string | null;
  posterUrl: string | null;
  category: string | null;
  priceFrom: string | null;
};

function clean(raw: string | undefined): string {
  // Заголовок <h1> на сайте закодирован ДВАЖДЫ («&amp;#039;»), карточки
  // каталога — один раз. Раскодируем повторно, пока мнемоники остаются,
  // но не больше двух проходов: дальше это уже текст с амперсандом.
  let text = decodeHtmlEntities(raw ?? "");
  if (/&(?:#\d+|amp|quot|#x[0-9a-f]+);/i.test(text)) text = decodeHtmlEntities(text);
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Услуга выкупа, а не отдельное событие. */
export function isPurchasingService(title: string): boolean {
  return /【\s*purchasing\s+service\s*】/i.test(title);
}

/**
 * Карточки каталога (чистая функция — юнит-тест
 * tests/unit/ticketsEasy.test.ts).
 *
 * Разметка карточки:
 *   <a href="…/event?id=214876">
 *     <div class="tes-poster"><img src="…jpg" alt="…"></div>
 *     <div class="tes-card-body">
 *       <span class="tes-category-label">Concerts</span>
 *       <p class="tes-meta">Thailand · 2026-09-26 18:00 HKT</p>
 *       <h3>…</h3><p>MCC Hall…</p><strong>HK$ 469.00 from</strong>
 */
export function parseTicketsEasyCatalog(html: string): TicketsEasyCard[] {
  const out: TicketsEasyCard[] = [];
  const seen = new Set<string>();
  const cards = html.matchAll(
    /<a[^>]+href="(https:\/\/tickets-easy\.com\/[^"]*\/module\/ticketseasy\/event\?id=\d+)"([\s\S]{0,2000}?)<\/a>/gi,
  );
  for (const card of cards) {
    const url = decodeHtmlEntities(card[1]);
    if (seen.has(url)) continue;
    const body = card[2];
    const title = clean(body.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1]);
    if (!title) continue;
    seen.add(url);
    // «Thailand · 2026-09-26 18:00 HKT» — страна, дата и время подписью.
    // Точку-разделитель сайт пишет символом, но мнемонику тоже
    // переживём: разъедется вёрстка — страна всё равно прочитается.
    const meta = clean(body.match(/tes-meta[^>]*>([\s\S]*?)<\//i)?.[1]).replace(/&middot;/gi, "·");
    const parts = meta.split("·").map((p) => p.trim());
    const when = parts.length > 1 ? parts[parts.length - 1] : parts[0];
    out.push({
      url,
      title,
      venue: clean(body.match(/<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/i)?.[1]) || null,
      country: parts.length > 1 ? parts[0] || null : null,
      date: when.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null,
      claimedTime: when.match(/\b(\d{1,2}:\d{2})\b/)?.[1] ?? null,
      posterUrl: body.match(/<img[^>]+src="([^"]+)"/i)?.[1] ?? null,
      category: clean(body.match(/tes-category-label[^>]*>([\s\S]*?)<\//i)?.[1]) || null,
      priceFrom: clean(body.match(/<strong[^>]*>([\s\S]*?)<\/strong>/i)?.[1]) || null,
    });
  }
  return out;
}

/** Дни со страницы события: список сессий вида «Sat 17 Oct 2026·16:00»
 *  плюс машинные «2026-10-18 16:00 HKT» рядом с ними. Берём машинные —
 *  их не надо разбирать по названиям месяцев. */
export function parseTicketsEasySessionDates(html: string): string[] {
  const days = [...html.matchAll(/\b(\d{4}-\d{2}-\d{2})\s+\d{1,2}:\d{2}/g)].map((m) => m[1]);
  return [...new Set(days)].sort();
}

async function fetchHtml(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (e) {
    throw new Error(
      `tickets-easy.com не ответил (${e instanceof Error ? e.message.split("\n")[0] : String(e)})`,
    );
  }
  if (!res.ok) throw new Error(`tickets-easy.com ответил ${res.status}`);
  return res.text();
}

/** Тайская афиша сайта. Только страна из `TICKETS_EASY_COUNTRY` и без
 *  услуг выкупа — фильтр стоит на КАРТОЧКЕ, а не только в адресе
 *  запроса: поменяется фильтр на сайте — чужие события всё равно не
 *  попадут в очередь. */
export async function fetchTicketsEasyThailand(): Promise<TicketsEasyCard[]> {
  const cards = parseTicketsEasyCatalog(await fetchHtml(TICKETS_EASY_THAILAND_URL));
  return cards.filter(
    (c) =>
      (c.country ?? "").toLowerCase() === TICKETS_EASY_COUNTRY.toLowerCase() &&
      !isPurchasingService(c.title),
  );
}

/**
 * Событие в форме TtmEvent — той же, что у остальных билетных сайтов.
 * Дата и остальные дни — из сессий страницы (если их нет, остаётся дата
 * карточки), время пустое, заявленное сайтом время — в описании.
 */
export async function scrapeTicketsEasyEvent(url: string, card?: TicketsEasyCard): Promise<TtmEvent> {
  const html = await fetchHtml(url);
  const title = card?.title ?? clean(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]);
  if (!title) throw new Error("tickets-easy.com: не нашла название события");

  const sessions = parseTicketsEasySessionDates(html);
  const days = sessions.length > 0 ? sessions : card?.date ? [card.date] : [];
  const claimed = card?.claimedTime ?? html.match(/\d{4}-\d{2}-\d{2}\s+(\d{1,2}:\d{2})/)?.[1] ?? null;

  // Площадка на странице стоит строкой под названием; у карточки она
  // уже есть — берём её, она чище.
  const venue =
    card?.venue ??
    clean(html.match(/<h1[^>]*>[\s\S]*?<\/h1>\s*(?:<[^>]+>\s*)*?<p[^>]*>([\s\S]*?)<\/p>/i)?.[1]) ??
    null;

  return {
    title,
    venue: venue || null,
    posterUrl: card?.posterUrl ?? html.match(/<img[^>]+src="(https:\/\/img\.tixbay\.com\/[^"]+)"/i)?.[1] ?? null,
    date: days[0] ?? null,
    // Время НЕ берём (см. шапку): оно подписано как HKT, но сверка с
    // нашими записями даёт разные сдвиги.
    startTime: null,
    extraDates: days.slice(1),
    dateRangeText: null,
    ticketPrice: null,
    // Единственное, что стоит показать проверяющему из описания
    // сайта, — заявленное время: остальное там про правила обмена
    // электронных билетов, одинаковое у всех событий.
    description: claimed
      ? `tickets-easy.com: начало заявлено как ${claimed} (сайт подписывает время как HKT, проверьте по официальной странице)`
      : null,
    presaleDate: null,
    presaleTime: null,
    artists: [],
    sourceUrl: url,
  };
}
