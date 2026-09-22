import { prisma } from "@/lib/prisma";
import type { TtmEvent } from "@/lib/thaiticketmajor";
import { scrapeAllticket, scrapeTicketmelonForCrawl } from "@/lib/eventTicketSites";
import { loadTagCatalog, matchCatalogInText, type TagCatalog } from "@/lib/performerMatching";
import { decodeHtmlEntities, findCatalogDuplicate } from "@/lib/eventDedupe";
import { checkImportCancelled } from "@/lib/importRun";
import { notifyAdmins } from "@/lib/adminNotify";
import type { EventDraftMatch } from "@/lib/ttmCrawl";

// Краулеры билетных сайтов без размеченного состава — Ticketmelon,
// AllTicket и tickets-easy (задачи «ticketmelon-crawl»,
// «allticket-crawl» и «ticketseasy-crawl», см.
// docs/features/ticket-site-crawl.md). Просьба владельца 2026-09-18:
// «Ticketmelon и AllTicket давай напишем парсер… и на них тоже
// отслеживать». Парсеры СТРАНИЦ у обоих уже были (eventTicketSites.ts,
// «событие по ссылке»); здесь — обход списков и черновики в ту же
// очередь, что у TTM и ThaiStarX.
//
// Состав на этих сайтах не размечен — он в названии и описании
// («BOY SOMPOB WORLD Y TOUR», «Joining the lineup: …»), поэтому артисты
// ищутся в тексте (matchCatalogInText, правила с оговорками). Нашлись —
// PENDING в очередь, нет — NO_MATCH с недельной перепроверкой.
//
// Источники списков:
//  - Ticketmelon: карта сайта sitemap-event1..5.xml (~600 событий,
//    прошедшие вперемешку с будущими, lastmod бесполезен). Страница
//    события отдаёт __NEXT_DATA__ — из него момент начала, по нему
//    прошедшие отсеиваются и запоминаются навсегда.
//  - AllTicket: их живой API за AWS WAF с JS-челленджем. С домашнего
//    адреса headless-браузер челлендж проходит и получает aws-waf-token,
//    но С НАШЕГО СЕРВЕРА API отвечает «403 Forbidden» — и curl, и
//    браузеру (проверено 2026-09-19 после первого ночного прогона).
//    Публичные страницы и master-файлы с того же адреса отдаются
//    спокойно: режут именно вызовы API, судя по всему по репутации
//    адреса дата-центра. Поэтому недоступность списка — НЕ падение
//    задачи: прогон честно заканчивается с пометкой, а события
//    AllTicket всё равно попадают к нам двумя другими путями —
//    «событие по ссылке» (master-файл, работает) и ссылки на AllTicket
//    в постах ThaiStarX и на фестивалях musicfestival.in.th.
//  - tickets-easy.com: каталог одной страницей с фильтром по стране —
//    берём ТОЛЬКО Таиланд (просьба владельца 2026-09-22). Время оттуда
//    не берём вовсе, см. шапку lib/ticketsEasy.ts.

const PAGE_PAUSE_MS = 1700;
const NO_MATCH_RECHECK_DAYS = 7;
/** Прошедшее событие — начало раньше, чем сутки назад. */
const PAST_GRACE_MS = 24 * 60 * 60 * 1000;

export type TicketSiteCrawlResult = {
  site: "ticketmelon" | "allticket" | "ticketseasy";
  /** Адресов в источнике списка (после канонизации и дедупа). */
  listed: number;
  fetched: number;
  newPending: number;
  noMatch: number;
  /** Прошедших/неопубликованных — запомнены навсегда, в очередь не идут. */
  skippedPast: number;
  rechecked: number;
  skippedKnown: number;
  duplicates: number;
  possibleDupes: number;
  failed: number;
  matchedNames: string[];
  listingErrors: string[];
  plan: { url: string; title: string; status: "PENDING" | "NO_MATCH" | "PAST" | "DUPLICATE" | "FAILED"; matched: string[] }[];
};

/** Payload черновика — TtmEvent плюс пометка, почему событие пропущено. */
export type TicketSiteDraftPayload = TtmEvent & {
  ticketSite: {
    site: "ticketmelon" | "allticket" | "ticketseasy";
    categories: string[];
    skipped: "past" | "unpublished" | null;
  };
  possibleDuplicateOf?: { eventId: string; eventTitle: string };
};

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emptyResult(site: TicketSiteCrawlResult["site"]): TicketSiteCrawlResult {
  return { site, listed: 0, fetched: 0, newPending: 0, noMatch: 0, skippedPast: 0, rechecked: 0, skippedKnown: 0, duplicates: 0, possibleDupes: 0, failed: 0, matchedNames: [], listingErrors: [], plan: [] };
}

// ------------------------------------------------------------ Ticketmelon

export const TICKETMELON_SITEMAP_URLS = [1, 2, 3, 4, 5].map((i) => `https://www.ticketmelon.com/sitemap-event${i}.xml`);

/** Канонический адрес события: https://www.ticketmelon.com/<организатор>/<событие>
 *  без query/hash. Один сегмент — страница организатора, не событие. */
export function canonicalTicketmelonUrl(href: string): string | null {
  let u: URL;
  try {
    u = new URL(href, "https://www.ticketmelon.com/");
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "ticketmelon.com") return null;
  const parts = u.pathname.split("/").filter(Boolean);
  // /th/<eo>/<event> — языковой префикс, тот же адрес.
  if (parts.length === 3 && /^(th|en)$/i.test(parts[0])) parts.shift();
  if (parts.length !== 2) return null;
  if (/^(authen|order|user|search|other|api|_next)$/i.test(parts[0])) return null;
  return `https://www.ticketmelon.com/${parts[0]}/${parts[1]}`;
}

/** Адреса событий из карты сайта (чистая функция). */
export function parseTicketmelonSitemap(xml: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    const url = canonicalTicketmelonUrl(decodeHtmlEntities(m[1]));
    if (url && !seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}

export function isPastStart(showStartMs: number | null, now = Date.now()): boolean {
  return showStartMs !== null && showStartMs < now - PAST_GRACE_MS;
}

async function fetchSitemap(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 MyBLHubImporter/1.0" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

// -------------------------------------------------------------- AllTicket

export type AllticketCard = {
  performUri?: string;
  id?: string;
  name?: string;
  fullname?: string;
  performShowDate?: string;
  performLocation?: string;
  performSubType?: string;
  performCardPic?: string;
};

/** Карточки концертного раздела → адреса событий. Купоны (PACKAGE) и
 *  справочные карточки (INFO) — не события. */
export function allticketCardsToUrls(cards: AllticketCard[]): { url: string; title: string }[] {
  const out: { url: string; title: string }[] = [];
  const seen = new Set<string>();
  for (const c of cards) {
    const sub = (c.performSubType ?? "").toUpperCase();
    if (sub === "PACKAGE" || sub === "INFO") continue;
    const uri = (c.performUri || c.id || "").trim();
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    out.push({ url: `https://www.allticket.com/event/${uri}`, title: (c.fullname || c.name || "").trim() });
  }
  return out;
}

/** Список AllTicket недоступен с этого адреса (WAF/репутация IP) — не
 *  ошибка прогона, а его законный исход. */
export class AllticketListingBlockedError extends Error {}

/** Список концертов AllTicket — через headless-браузер (см. шапку). */
export async function fetchAllticketConcertCards(): Promise<AllticketCard[]> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      locale: "en-US",
    });
    const page = await ctx.newPage();
    await page.goto("https://www.allticket.com/concert", { waitUntil: "networkidle", timeout: 60000 }).catch(() => {
      // networkidle у SPA бывает не наступает — челлендж WAF к этому
      // моменту обычно уже пройден, пробуем запрос.
    });
    await page.waitForTimeout(2000);
    const text = await page.evaluate(async () => {
      const res = await fetch("/api-content/get-events-menu-key", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: " " },
        body: JSON.stringify({ menuKey: "concert" }),
      });
      return `${res.status}\n${await res.text()}`;
    });
    const [status, body] = [text.slice(0, text.indexOf("\n")), text.slice(text.indexOf("\n") + 1)];
    if (status === "403" || status === "202") {
      throw new AllticketListingBlockedError(
        `список закрыт для этого адреса (ответ ${status}): события AllTicket берём по ссылкам — «событие по ссылке» и посты ThaiStarX`,
      );
    }
    if (status !== "200") throw new Error(`allticket: список ответил ${status}`);
    const parsed = JSON.parse(body) as { data?: { item?: AllticketCard[] } };
    return parsed.data?.item ?? [];
  } finally {
    await browser.close();
  }
}

// ------------------------------------------------------------- общий ход

type Known = { knownEventUrls: Set<string>; draftByUrl: Map<string, { status: string; checkedAt: Date; skipped: string | null }> };

async function loadKnown(hostFragment: string): Promise<Known> {
  const events = await prisma.event.findMany({ where: { sourceUrl: { contains: hostFragment } }, select: { sourceUrl: true } });
  const drafts = await prisma.eventDraft.findMany({ where: { sourceUrl: { contains: hostFragment } }, select: { sourceUrl: true, status: true, checkedAt: true, payload: true } });
  return {
    knownEventUrls: new Set(events.map((e) => e.sourceUrl!)),
    draftByUrl: new Map(
      drafts.map((d) => [d.sourceUrl, { status: d.status, checkedAt: d.checkedAt, skipped: (d.payload as Partial<TicketSiteDraftPayload> | null)?.ticketSite?.skipped ?? null }]),
    ),
  };
}

/** Очередь на прогон: новые + NO_MATCH старше недели (кроме навсегда
 *  пропущенных — прошедших); новые вперёд. */
function planQueue<T extends { url: string }>(cards: T[], known: Known, result: TicketSiteCrawlResult, max: number): { queue: T[]; isRecheck: (url: string) => boolean } {
  const recheckBefore = new Date(Date.now() - NO_MATCH_RECHECK_DAYS * 24 * 60 * 60 * 1000);
  const fresh: T[] = [];
  const recheck: T[] = [];
  for (const c of cards) {
    if (known.knownEventUrls.has(c.url)) {
      result.skippedKnown++;
      continue;
    }
    const d = known.draftByUrl.get(c.url);
    if (!d) fresh.push(c);
    else if (d.status === "NO_MATCH" && !d.skipped && d.checkedAt < recheckBefore) recheck.push(c);
    else result.skippedKnown++;
  }
  recheck.sort((a, b) => known.draftByUrl.get(a.url)!.checkedAt.getTime() - known.draftByUrl.get(b.url)!.checkedAt.getTime());
  return { queue: [...fresh, ...recheck].slice(0, Math.max(0, max)), isRecheck: (url) => known.draftByUrl.has(url) };
}

/** Событие → черновик: дедуп по каталогу, поиск артистов в тексте,
 *  запись. Общее для обоих сайтов. */
async function fileDraft(
  site: TicketSiteCrawlResult["site"],
  url: string,
  scraped: TtmEvent,
  categories: string[],
  skipped: "past" | "unpublished" | null,
  catalog: TagCatalog,
  runId: string | null,
  apply: boolean,
  result: TicketSiteCrawlResult,
): Promise<void> {
  const base: TicketSiteDraftPayload = {
    ...scraped,
    title: decodeHtmlEntities(scraped.title),
    venue: scraped.venue ? decodeHtmlEntities(scraped.venue) : scraped.venue,
    sourceUrl: url,
    ticketSite: { site, categories, skipped },
  };
  const title = base.title || url;

  if (skipped) {
    // Прошедшее или снятое с публикации — навсегда: NO_MATCH с пометкой,
    // недельная перепроверка такие обходит стороной.
    if (apply) {
      const payload = JSON.parse(JSON.stringify(base));
      await prisma.eventDraft.upsert({
        where: { sourceUrl: url },
        create: { sourceUrl: url, payload, matchedPerformers: [], status: "NO_MATCH" },
        update: { payload, status: "NO_MATCH", checkedAt: new Date() },
      });
    }
    result.skippedPast++;
    result.plan.push({ url, title, status: "PAST", matched: [] });
    return;
  }

  const dupe = base.date ? await findCatalogDuplicate(base) : null;
  if (dupe && dupe.strength === "strong") {
    if (apply) {
      if (!dupe.eventSourceUrl) await prisma.event.update({ where: { id: dupe.eventId }, data: { sourceUrl: url } });
      const payload = JSON.parse(JSON.stringify(base));
      await prisma.eventDraft.upsert({
        where: { sourceUrl: url },
        create: { sourceUrl: url, payload, matchedPerformers: [], status: "APPROVED", eventId: dupe.eventId, reviewedAt: new Date() },
        update: { payload, status: "APPROVED", eventId: dupe.eventId, reviewedAt: new Date(), checkedAt: new Date() },
      });
    }
    result.duplicates++;
    result.plan.push({ url, title, status: "DUPLICATE", matched: [] });
    return;
  }

  const { matched } = matchCatalogInText(`${base.title}\n${base.description ?? ""}`, catalog);
  const matchedDraft: EventDraftMatch[] = matched.map((m) => ({ performerId: m.performerId, nickname: m.nickname }));
  if (dupe && matchedDraft.length > 0) result.possibleDupes++;
  const payload = JSON.parse(JSON.stringify({ ...base, ...(dupe ? { possibleDuplicateOf: { eventId: dupe.eventId, eventTitle: dupe.eventTitle } } : {}) }));
  const pending = matchedDraft.length > 0;
  result.plan.push({ url, title, status: pending ? "PENDING" : "NO_MATCH", matched: matchedDraft.map((m) => m.nickname) });
  if (!apply) {
    if (pending) result.newPending++;
    else result.noMatch++;
    return;
  }
  if (pending) {
    const draft = await prisma.eventDraft.upsert({
      where: { sourceUrl: url },
      create: { sourceUrl: url, payload, matchedPerformers: matchedDraft, status: "PENDING" },
      update: { payload, matchedPerformers: matchedDraft, status: "PENDING", checkedAt: new Date() },
    });
    result.newPending++;
    result.matchedNames.push(...matchedDraft.map((m) => m.nickname));
    if (runId) {
      await prisma.importedItem.create({ data: { runId, entityType: "event-draft", entityId: draft.id, action: "created", label: title } });
    }
  } else {
    await prisma.eventDraft.upsert({
      where: { sourceUrl: url },
      create: { sourceUrl: url, payload, matchedPerformers: [], status: "NO_MATCH" },
      update: { payload, checkedAt: new Date() },
    });
    result.noMatch++;
  }
}

async function notifyIfAny(
  result: TicketSiteCrawlResult,
  runId: string | null,
  label: string,
  apply: boolean,
): Promise<void> {
  // Черновой прогон (apply: false) ничего не записывает — и письма о
  // «новых черновиках» слать не должен.
  if (!apply || result.newPending === 0) return;
  const appUrl = process.env.APP_URL || "";
  await notifyAdmins("import", `${label}: черновиков событий +${result.newPending}, ждут проверки` + (appUrl ? `\n${appUrl}/admin/imports?tab=events` : ""), { dedupKey: runId ?? label });
}

/** Ticketmelon: карта сайта → новые адреса → страницы → черновики.
 *  Потолок страниц — суточный (60) или «всё» (кнопка на импортах). */
export async function runTicketmelonCrawl(opts: { runId?: string | null; maxPages?: number; apply?: boolean } = {}): Promise<TicketSiteCrawlResult> {
  const runId = opts.runId ?? null;
  const apply = opts.apply ?? true;
  const maxPages = opts.maxPages ?? 60;
  const result = emptyResult("ticketmelon");

  const urls: string[] = [];
  const seen = new Set<string>();
  for (const sitemap of TICKETMELON_SITEMAP_URLS) {
    try {
      for (const u of parseTicketmelonSitemap(await fetchSitemap(sitemap))) {
        if (!seen.has(u)) {
          seen.add(u);
          urls.push(u);
        }
      }
    } catch (e) {
      result.listingErrors.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (urls.length === 0 && result.listingErrors.length > 0) throw new Error(`карта сайта не открылась: ${result.listingErrors.join("; ")}`);
  result.listed = urls.length;

  const known = await loadKnown("ticketmelon.com");
  const { queue, isRecheck } = planQueue(urls.map((url) => ({ url })), known, result, maxPages);
  if (queue.length === 0) return result;
  const catalog = await loadTagCatalog();

  for (const { url } of queue) {
    await checkImportCancelled(runId);
    if (result.fetched > 0) await pause(PAGE_PAUSE_MS);
    let scraped;
    try {
      scraped = await scrapeTicketmelonForCrawl(url);
      result.fetched++;
    } catch (e) {
      result.fetched++;
      result.failed++;
      result.plan.push({ url, title: url, status: "FAILED", matched: [] });
      console.warn(`ticketmelon-crawl: ${url} ->`, e instanceof Error ? e.message : e);
      continue;
    }
    if (isRecheck(url)) result.rechecked++;
    const meta = scraped.meta;
    const skipped: "past" | "unpublished" | null =
      meta && (!meta.isActive || (meta.status && meta.status !== "publish")) ? "unpublished" : isPastStart(meta?.showStartMs ?? null) ? "past" : null;
    await fileDraft("ticketmelon", url, scraped.event, meta?.categories ?? [], skipped, catalog, runId, apply, result);
  }
  await notifyIfAny(result, runId, "Ticketmelon", apply);
  return result;
}

/** AllTicket: концертный раздел через браузер → master-файлы событий →
 *  черновики. Событий там десятки, потолка не нужно. */
export async function runAllticketCrawl(opts: { runId?: string | null; apply?: boolean; cards?: AllticketCard[] } = {}): Promise<TicketSiteCrawlResult> {
  const runId = opts.runId ?? null;
  const apply = opts.apply ?? true;
  const result = emptyResult("allticket");

  let cards: AllticketCard[];
  try {
    cards = opts.cards ?? (await fetchAllticketConcertCards());
  } catch (e) {
    // Закрытый список — не падение: прогон заканчивается с пояснением в
    // сводке, красной точки на вкладке задачи и письма админам нет.
    if (e instanceof AllticketListingBlockedError) {
      result.listingErrors.push(e.message);
      return result;
    }
    throw e;
  }
  const listed = allticketCardsToUrls(cards);
  result.listed = listed.length;
  const known = await loadKnown("allticket.com");
  const { queue, isRecheck } = planQueue(listed, known, result, 200);
  if (queue.length === 0) return result;
  const catalog = await loadTagCatalog();

  for (const { url, title } of queue) {
    await checkImportCancelled(runId);
    if (result.fetched > 0) await pause(PAGE_PAUSE_MS);
    let scraped: TtmEvent;
    try {
      scraped = await scrapeAllticket(url);
      result.fetched++;
    } catch (e) {
      result.fetched++;
      result.failed++;
      result.plan.push({ url, title, status: "FAILED", matched: [] });
      console.warn(`allticket-crawl: ${url} ->`, e instanceof Error ? e.message : e);
      continue;
    }
    if (!scraped.title) scraped = { ...scraped, title };
    if (isRecheck(url)) result.rechecked++;
    // Даты у AllTicket текстом; прошедшее — все дни раньше вчерашнего.
    const days = [scraped.date, ...scraped.extraDates].filter((d): d is string => Boolean(d)).sort();
    const last = days[days.length - 1];
    const skipped = last && new Date(`${last}T23:59:59Z`).getTime() < Date.now() - PAST_GRACE_MS ? "past" : null;
    await fileDraft("allticket", url, scraped, [], skipped, catalog, runId, apply, result);
  }
  await notifyIfAny(result, runId, "AllTicket", apply);
  return result;
}

/**
 * tickets-easy: тайская афиша одной страницей → страницы событий →
 * черновики (просьба владельца 2026-09-22: «есть сайт с афишами и
 * билетами, можем тоже добавить в расписание, только тайландские»).
 *
 * Страна фильтруется дважды — параметром запроса и по самой карточке
 * (см. `fetchTicketsEasyThailand`). Событий там пара десятков, потолка
 * не нужно.
 */
export async function runTicketsEasyCrawl(
  opts: { runId?: string | null; apply?: boolean } = {},
): Promise<TicketSiteCrawlResult> {
  const runId = opts.runId ?? null;
  const apply = opts.apply ?? true;
  const result = emptyResult("ticketseasy");

  const { fetchTicketsEasyThailand, scrapeTicketsEasyEvent } = await import("@/lib/ticketsEasy");
  const cards = await fetchTicketsEasyThailand();
  result.listed = cards.length;

  const known = await loadKnown("tickets-easy.com");
  const { queue, isRecheck } = planQueue(cards, known, result, 100);
  if (queue.length === 0) return result;
  const catalog = await loadTagCatalog();

  for (const card of queue) {
    await checkImportCancelled(runId);
    if (result.fetched > 0) await pause(PAGE_PAUSE_MS);
    let scraped: TtmEvent;
    try {
      scraped = await scrapeTicketsEasyEvent(card.url, card);
      result.fetched++;
    } catch (e) {
      result.fetched++;
      result.failed++;
      result.plan.push({ url: card.url, title: card.title, status: "FAILED", matched: [] });
      console.warn(`ticketseasy-crawl: ${card.url} ->`, e instanceof Error ? e.message : e);
      continue;
    }
    if (isRecheck(card.url)) result.rechecked++;
    // Времени у нас нет, поэтому прошедшим считаем день целиком.
    const days = [scraped.date, ...scraped.extraDates].filter((d): d is string => Boolean(d)).sort();
    const last = days[days.length - 1];
    const skipped = last && new Date(`${last}T23:59:59Z`).getTime() < Date.now() - PAST_GRACE_MS ? "past" : null;
    await fileDraft(
      "ticketseasy",
      card.url,
      scraped,
      card.category ? [card.category] : [],
      skipped,
      catalog,
      runId,
      apply,
      result,
    );
  }
  await notifyIfAny(result, runId, "tickets-easy", apply);
  return result;
}

export function summarizeTicketSiteCrawl(r: TicketSiteCrawlResult): string {
  const names = [...new Set(r.matchedNames)];
  const parts = [
    `в списке ${r.listed}`,
    `скачано ${r.fetched}`,
    `черновиков +${r.newPending}` + (names.length ? ` (${names.slice(0, 12).join(", ")}${names.length > 12 ? "…" : ""})` : ""),
    `без совпадений ${r.noMatch}`,
    `прошедших ${r.skippedPast}`,
    `уже в каталоге ${r.duplicates}`,
    `пропущено знакомых ${r.skippedKnown}`,
  ];
  if (r.possibleDupes) parts.push(`возможных дублей ${r.possibleDupes}`);
  if (r.failed) parts.push(`не разобралось ${r.failed}`);
  if (r.listingErrors.length) parts.push(`список: ${r.listingErrors.join("; ")}`);
  return parts.join(" · ");
}
