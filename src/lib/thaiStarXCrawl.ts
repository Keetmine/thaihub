import { prisma } from "@/lib/prisma";
import {
  isTicketHost,
  scrapeThaiStarXListing,
  scrapeThaiStarXPost,
  type ThaiStarXCard,
  type ThaiStarXPost,
  type ThaiStarXTicketLink,
} from "@/lib/thaiStarX";
import { canonicalTtmEventUrl, scrapeTtmEvent, type TtmEvent } from "@/lib/thaiticketmajor";
import {
  loadTagCatalog,
  matchArtistsByNickname,
  matchTagsAgainstCatalog,
  type TagCatalog,
} from "@/lib/performerMatching";
import { decodeHtmlEntities, findCatalogDuplicate } from "@/lib/eventDedupe";
import { checkImportCancelled } from "@/lib/importRun";
import { notifyAdmins } from "@/lib/adminNotify";
import type { EventDraftAmbiguity, EventDraftMatch } from "@/lib/ttmCrawl";

// Краулер thaistarx.com (задача «thaistarx-crawl», см.
// docs/features/thaistarx-crawl.md). Просьба владельца 2026-09-18:
// «давай спарсим всё, чего не хватает». Тот же путь, что у обхода
// афиши ThaiTicketMajor (ttmCrawl.ts): публичной таблицы Event краулер
// не касается — каждое событие становится черновиком EventDraft в
// очереди на /admin/imports, владелец одобряет или отклоняет.
//
// Отличия от TTM:
//  - состав события берётся из ТЕГОВ поста (слаги артистов и пейрингов,
//    matchTagsAgainstCatalog), а не из строки «Artists»;
//  - если в блоке билетов есть ссылка на ThaiTicketMajor, страница TTM
//    дочитывается существующим парсером — оттуда время, цены и полный
//    состав (просьба владельца: «если есть TTM, у нас для него уже
//    парсер есть»);
//  - площадка бывает где угодно в мире, и у черновика есть часовой
//    пояс по стране/городу — событие получит его при одобрении.

export type ThaiStarXListingKind = "recent" | "archive";

/** Страниц списка за прогон: суточный обход останавливается раньше —
 *  на первой странице, где все посты уже знакомы; архив листает до
 *  конца (на 2026-09-18 — 13 страниц). */
const MAX_LISTING_PAGES: Record<ThaiStarXListingKind, number> = { recent: 3, archive: 30 };
/** Потолок страниц постов за прогон — суточная задача с паузами не
 *  должна висеть часами; архив забирается одной кнопкой целиком. */
const MAX_POSTS_PER_RUN: Record<ThaiStarXListingKind, number> = { recent: 40, archive: 250 };
const PAGE_PAUSE_MS = 1700;
const LISTING_PAUSE_MS = 1200;
/** NO_MATCH перепроверяется, когда прошлая проверка старше этого. */
const NO_MATCH_RECHECK_DAYS = 7;

/** Payload черновика: форма TtmEvent (её понимают очередь, одобрение и
 *  прокси постера) плюс то, что даёт ThaiStarX. */
export type ThaiStarXDraftPayload = TtmEvent & {
  /** Куда идти за билетами — первая билетная ссылка поста (TTM в
   *  приоритете); при одобрении становится Event.presaleUrl. */
  presaleUrl: string | null;
  /** IANA-зона площадки; при одобрении — Event.timezone. */
  timezone: string | null;
  thaiStarX: {
    dates: string[];
    dateText: string | null;
    tags: string[];
    categories: string[];
    ticketLinks: ThaiStarXTicketLink[];
    announcementUrl: string | null;
    /** Страница TTM, которой обогатили черновик (или null). */
    ttmUrl: string | null;
  };
  ambiguousArtists?: EventDraftAmbiguity[];
  possibleDuplicateOf?: { eventId: string; eventTitle: string };
};

export type ThaiStarXPlanItem = {
  url: string;
  title: string;
  dates: string[];
  timezone: string | null;
  matched: string[];
  ambiguous: string[];
  ttmUrl: string | null;
  status: "PENDING" | "NO_MATCH" | "DUPLICATE" | "KNOWN_TTM" | "FAILED";
};

export type ThaiStarXCrawlResult = {
  listing: ThaiStarXListingKind;
  listingPages: number;
  cardsFound: number;
  fetched: number;
  newPending: number;
  noMatch: number;
  rechecked: number;
  skippedKnown: number;
  /** Событие уже в каталоге (сильный дубль) — черновик не создан. */
  duplicates: number;
  possibleDupes: number;
  /** Обогащено страницей TTM. */
  ttmEnriched: number;
  failed: number;
  matchedNames: string[];
  listingErrors: string[];
  /** Сухой прогон (apply: false) — что было бы сделано. */
  plan: ThaiStarXPlanItem[];
};

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Ссылка на TTM среди билетных ссылок поста — канонический адрес. */
export function ttmUrlFromLinks(links: ThaiStarXTicketLink[]): string | null {
  for (const l of links) {
    if (!/thaiticketmajor\.com/i.test(l.url)) continue;
    const c = canonicalTtmEventUrl(l.url);
    if (c) return c;
  }
  return null;
}

/** Куда вести за билетами: TTM, иначе первая билетная ссылка. */
export function pickPresaleUrl(links: ThaiStarXTicketLink[], ttmUrl: string | null): string | null {
  if (ttmUrl) return ttmUrl;
  const first = links.find((l) => l.url && isTicketHost(l.url));
  return first?.url ?? null;
}

/** Пост (+ страница TTM, если была) → payload черновика. Чистая функция —
 *  проверяется юнит-тестом. Даты — из поста (теги редакции — источник
 *  переносов), время/цены/состав — с TTM, если у поста своих нет. */
export function buildThaiStarXPayload(post: ThaiStarXPost, ttm: TtmEvent | null, ttmUrl: string | null): ThaiStarXDraftPayload {
  const [date, ...extraDates] = post.dates;
  return {
    title: decodeHtmlEntities(post.title),
    venue: post.venue ? decodeHtmlEntities(post.venue) : (ttm?.venue ?? null),
    posterUrl: post.posterUrl ?? ttm?.posterUrl ?? null,
    date: date ?? null,
    startTime: post.startTime ?? ttm?.startTime ?? null,
    extraDates,
    dateRangeText: post.dateText,
    ticketPrice: ttm?.ticketPrice ?? null,
    description: post.description,
    presaleDate: post.presaleDate ?? ttm?.presaleDate ?? null,
    presaleTime: (post.presaleDate ? post.presaleTime : ttm?.presaleTime) ?? null,
    artists: ttm?.artists ?? [],
    sourceUrl: post.sourceUrl,
    presaleUrl: pickPresaleUrl(post.ticketLinks, ttmUrl),
    timezone: post.timezone,
    thaiStarX: {
      dates: post.dates,
      dateText: post.dateText,
      tags: post.tags,
      categories: post.categories,
      ticketLinks: post.ticketLinks,
      announcementUrl: post.announcementUrl,
      ttmUrl,
    },
  };
}

/** Состав: теги поста + строка «Artists» с TTM. Привязки объединяются
 *  по performerId, тёзки — по нику (уже привязанный по тегу артист из
 *  тёзок выпадает: тег его развёл). */
export async function matchThaiStarXArtists(
  post: ThaiStarXPost,
  ttm: TtmEvent | null,
  catalog: TagCatalog,
): Promise<{ matched: EventDraftMatch[]; ambiguous: EventDraftAmbiguity[] }> {
  const tagResult = matchTagsAgainstCatalog(post.tags, catalog);
  const matched: EventDraftMatch[] = [...tagResult.matched];
  const ambiguous: EventDraftAmbiguity[] = tagResult.ambiguous.map((a) => ({
    nickname: a.nickname,
    fullName: a.fullName,
    candidates: a.candidates,
  }));
  if (ttm && ttm.artists.length > 0) {
    for (const a of await matchArtistsByNickname(ttm.artists)) {
      if (a.matchedPerformerId && !matched.some((m) => m.performerId === a.matchedPerformerId)) {
        matched.push({ performerId: a.matchedPerformerId, nickname: a.nickname });
      } else if (a.via === "ambiguous" && !ambiguous.some((x) => x.nickname.toLowerCase() === a.nickname.toLowerCase())) {
        ambiguous.push({ nickname: a.nickname, fullName: a.fullName, candidates: a.candidates });
      }
    }
  }
  const matchedIds = new Set(matched.map((m) => m.performerId));
  return {
    matched,
    ambiguous: ambiguous.filter((a) => !a.candidates.some((c) => matchedIds.has(c.id))),
  };
}

export async function runThaiStarXCrawl(
  opts: { listing?: ThaiStarXListingKind; runId?: string | null; maxPosts?: number; apply?: boolean } = {},
): Promise<ThaiStarXCrawlResult> {
  const listing = opts.listing ?? "recent";
  const runId = opts.runId ?? null;
  const apply = opts.apply ?? true;
  const maxPosts = opts.maxPosts ?? MAX_POSTS_PER_RUN[listing];

  const result: ThaiStarXCrawlResult = {
    listing,
    listingPages: 0,
    cardsFound: 0,
    fetched: 0,
    newPending: 0,
    noMatch: 0,
    rechecked: 0,
    skippedKnown: 0,
    duplicates: 0,
    possibleDupes: 0,
    ttmEnriched: 0,
    failed: 0,
    matchedNames: [],
    listingErrors: [],
    plan: [],
  };

  // 1. Память краулера — до списка: суточный обход по ней и решает, где
  // остановиться. URL уже в каталоге (Event.sourceUrl) — навсегда
  // пропуск; черновик PENDING/APPROVED/REJECTED — пропуск; NO_MATCH
  // старше недели — перепроверка.
  const knownEvents = await prisma.event.findMany({
    where: { sourceUrl: { contains: "thaistarx.com" } },
    select: { sourceUrl: true },
  });
  const knownEventUrls = new Set(knownEvents.map((e) => e.sourceUrl!));
  const drafts = await prisma.eventDraft.findMany({
    where: { sourceUrl: { contains: "thaistarx.com" } },
    select: { sourceUrl: true, status: true, checkedAt: true },
  });
  const draftByUrl = new Map(drafts.map((d) => [d.sourceUrl, d]));
  const recheckBefore = new Date(Date.now() - NO_MATCH_RECHECK_DAYS * 24 * 60 * 60 * 1000);
  const isKnown = (url: string) => {
    if (knownEventUrls.has(url)) return true;
    const d = draftByUrl.get(url);
    if (!d) return false;
    return !(d.status === "NO_MATCH" && d.checkedAt < recheckBefore);
  };

  // 2. Список: новые сверху; суточный обход останавливается на первой
  // странице, где ничего нового, архив — на последней.
  const cards = new Map<string, ThaiStarXCard>();
  for (let page = 1; page <= MAX_LISTING_PAGES[listing]; page++) {
    await checkImportCancelled(runId);
    if (page > 1) await pause(LISTING_PAUSE_MS);
    let pageResult;
    try {
      pageResult = await scrapeThaiStarXListing(page);
      result.listingPages++;
    } catch (e) {
      result.listingErrors.push(e instanceof Error ? e.message : String(e));
      break;
    }
    let fresh = 0;
    for (const card of pageResult.cards) {
      if (!cards.has(card.url)) cards.set(card.url, card);
      if (!isKnown(card.url)) fresh++;
    }
    if (!pageResult.hasNext || pageResult.cards.length === 0) break;
    if (listing === "recent" && fresh === 0) break;
  }
  if (cards.size === 0 && result.listingErrors.length > 0) {
    throw new Error(`список не открылся: ${result.listingErrors.join("; ")}`);
  }
  result.cardsFound = cards.size;

  const fresh: ThaiStarXCard[] = [];
  const recheck: ThaiStarXCard[] = [];
  for (const card of cards.values()) {
    if (knownEventUrls.has(card.url)) {
      result.skippedKnown++;
      continue;
    }
    const d = draftByUrl.get(card.url);
    if (!d) fresh.push(card);
    else if (d.status === "NO_MATCH" && d.checkedAt < recheckBefore) recheck.push(card);
    else result.skippedKnown++;
  }
  recheck.sort((a, b) => draftByUrl.get(a.url)!.checkedAt.getTime() - draftByUrl.get(b.url)!.checkedAt.getTime());
  const queue = [...fresh, ...recheck].slice(0, Math.max(0, maxPosts));
  if (queue.length === 0) return result;

  // Каталог для тегов — один раз на прогон.
  const catalog = await loadTagCatalog();

  // Память по TTM-адресам: событие или черновик уже есть по билетной
  // странице — не плодим второй черновик того же события.
  const ttmEvents = await prisma.event.findMany({
    where: { sourceUrl: { contains: "thaiticketmajor.com" } },
    select: { id: true, sourceUrl: true },
  });
  const eventByTtmUrl = new Map(ttmEvents.map((e) => [e.sourceUrl!, e.id]));
  const ttmDrafts = await prisma.eventDraft.findMany({
    where: { sourceUrl: { contains: "thaiticketmajor.com" } },
    select: { sourceUrl: true, status: true, eventId: true },
  });
  const ttmDraftByUrl = new Map(ttmDrafts.map((d) => [d.sourceUrl, d]));

  // 3. Посты — с паузой между страницами.
  for (const card of queue) {
    await checkImportCancelled(runId);
    if (result.fetched > 0) await pause(PAGE_PAUSE_MS);

    let post: ThaiStarXPost;
    try {
      post = await scrapeThaiStarXPost(card.url);
      result.fetched++;
    } catch (e) {
      result.fetched++;
      result.failed++;
      console.warn(`thaistarx-crawl: ${card.url} ->`, e instanceof Error ? e.message : e);
      continue;
    }
    if (draftByUrl.has(card.url)) result.rechecked++;
    if (!post.title) post = { ...post, title: card.title };
    // Без даты событие не заводится, адрес не запоминается —
    // перечитается в следующий прогон, вдруг дату допишут.
    if (post.dates.length === 0) {
      result.failed++;
      result.plan.push({ url: card.url, title: post.title, dates: [], timezone: post.timezone, matched: [], ambiguous: [], ttmUrl: null, status: "FAILED" });
      continue;
    }

    // 3a. Ссылка на TTM: событие/черновик по ней уже есть?
    const ttmUrl = ttmUrlFromLinks(post.ticketLinks);
    let ttm: TtmEvent | null = null;
    if (ttmUrl) {
      const existingEventId = eventByTtmUrl.get(ttmUrl) ?? ttmDraftByUrl.get(ttmUrl)?.eventId ?? null;
      const ttmDraft = ttmDraftByUrl.get(ttmUrl);
      if (existingEventId || ttmDraft?.status === "REJECTED" || ttmDraft?.status === "PENDING") {
        // Событие уже в каталоге — наш адрес привязываем к нему
        // (APPROVED + eventId, как «Одобрить» при существующем событии).
        // Владелец уже отклонил его по TTM — и наш черновик REJECTED.
        // Оно ждёт решения в очереди по TTM — свой не плодим, но
        // запоминаем NO_MATCH: через неделю тот черновик уже разобран.
        const status = existingEventId ? "APPROVED" : ttmDraft?.status === "REJECTED" ? "REJECTED" : "NO_MATCH";
        if (apply) {
          const payload = JSON.parse(JSON.stringify(buildThaiStarXPayload(post, null, ttmUrl)));
          await prisma.eventDraft.upsert({
            where: { sourceUrl: card.url },
            create: { sourceUrl: card.url, payload, matchedPerformers: [], status, eventId: existingEventId, reviewedAt: status === "NO_MATCH" ? null : new Date() },
            update: { payload, status, eventId: existingEventId, checkedAt: new Date(), reviewedAt: status === "NO_MATCH" ? null : new Date() },
          });
        }
        result.skippedKnown++;
        result.plan.push({ url: card.url, title: post.title, dates: post.dates, timezone: post.timezone, matched: [], ambiguous: [], ttmUrl, status: "KNOWN_TTM" });
        continue;
      }
      // Обогащение страницей TTM: время, цены, состав. Не открылась —
      // черновик всё равно заводится по посту.
      try {
        await pause(PAGE_PAUSE_MS);
        ttm = await scrapeTtmEvent(ttmUrl);
        ttm = { ...ttm, title: decodeHtmlEntities(ttm.title), venue: ttm.venue ? decodeHtmlEntities(ttm.venue) : ttm.venue };
        result.ttmEnriched++;
      } catch (e) {
        console.warn(`thaistarx-crawl: TTM ${ttmUrl} ->`, e instanceof Error ? e.message : e);
      }
    }

    const basePayload = buildThaiStarXPayload(post, ttm, ttmUrl);

    // 3b. Дедуп по содержимому (см. eventDedupe.ts): сильное совпадение
    // — событие уже в каталоге, черновик не показываем, sourceUrl
    // бэкфилим, адрес запоминаем APPROVED с eventId.
    const dupe = await findCatalogDuplicate(basePayload);
    if (dupe && dupe.strength === "strong") {
      if (apply) {
        if (!dupe.eventSourceUrl) {
          await prisma.event.update({ where: { id: dupe.eventId }, data: { sourceUrl: card.url } });
        }
        const payload = JSON.parse(JSON.stringify(basePayload));
        await prisma.eventDraft.upsert({
          where: { sourceUrl: card.url },
          create: { sourceUrl: card.url, payload, matchedPerformers: [], status: "APPROVED", eventId: dupe.eventId, reviewedAt: new Date() },
          update: { payload, status: "APPROVED", eventId: dupe.eventId, reviewedAt: new Date(), checkedAt: new Date() },
        });
      }
      result.duplicates++;
      result.plan.push({ url: card.url, title: post.title, dates: post.dates, timezone: post.timezone, matched: [], ambiguous: [], ttmUrl, status: "DUPLICATE" });
      continue;
    }

    // 3c. Состав: теги + строка TTM.
    const { matched, ambiguous } = await matchThaiStarXArtists(post, ttm, catalog);
    if (dupe && matched.length > 0) result.possibleDupes++;
    const payload = JSON.parse(
      JSON.stringify({
        ...basePayload,
        ...(ambiguous.length > 0 ? { ambiguousArtists: ambiguous } : {}),
        ...(dupe ? { possibleDuplicateOf: { eventId: dupe.eventId, eventTitle: dupe.eventTitle } } : {}),
      }),
    );

    const pending = matched.length > 0 || ambiguous.length > 0;
    result.plan.push({
      url: card.url,
      title: post.title,
      dates: post.dates,
      timezone: post.timezone,
      matched: matched.map((m) => m.nickname),
      ambiguous: ambiguous.map((a) => a.nickname),
      ttmUrl,
      status: pending ? "PENDING" : "NO_MATCH",
    });
    if (!apply) {
      if (pending) result.newPending++;
      else result.noMatch++;
      continue;
    }
    if (pending) {
      const draft = await prisma.eventDraft.upsert({
        where: { sourceUrl: card.url },
        create: { sourceUrl: card.url, payload, matchedPerformers: matched, status: "PENDING" },
        update: { payload, matchedPerformers: matched, status: "PENDING", checkedAt: new Date() },
      });
      result.newPending++;
      result.matchedNames.push(...matched.map((m) => m.nickname));
      if (runId) {
        await prisma.importedItem.create({
          data: { runId, entityType: "event-draft", entityId: draft.id, action: "created", label: post.title || card.url },
        });
      }
    } else {
      await prisma.eventDraft.upsert({
        where: { sourceUrl: card.url },
        create: { sourceUrl: card.url, payload, matchedPerformers: [], status: "NO_MATCH" },
        update: { payload, checkedAt: new Date() },
      });
      result.noMatch++;
    }
  }

  // 4. Одно уведомление на прогон.
  if (apply && result.newPending > 0) {
    const appUrl = process.env.APP_URL || "";
    await notifyAdmins(
      "import",
      `ThaiStarX: черновиков событий +${result.newPending}, ждут проверки` + (appUrl ? `\n${appUrl}/admin/imports?tab=events` : ""),
      { dedupKey: runId ?? "thaistarx-crawl" },
    );
  }
  return result;
}

/** Сводка прогона — для журнала импортов и строки расписания. */
export function summarizeThaiStarXCrawl(r: ThaiStarXCrawlResult): string {
  const names = [...new Set(r.matchedNames)];
  const parts = [
    `${r.listing === "archive" ? "архив" : "новое"}: страниц списка ${r.listingPages}, постов ${r.cardsFound}`,
    `скачано ${r.fetched}`,
    `черновиков +${r.newPending}` + (names.length ? ` (${names.slice(0, 12).join(", ")}${names.length > 12 ? "…" : ""})` : ""),
    `без совпадений ${r.noMatch}`,
    `уже в каталоге ${r.duplicates}`,
    `пропущено знакомых ${r.skippedKnown}`,
  ];
  if (r.ttmEnriched) parts.push(`дочитано с TTM ${r.ttmEnriched}`);
  if (r.possibleDupes) parts.push(`возможных дублей ${r.possibleDupes}`);
  if (r.failed) parts.push(`не разобралось ${r.failed}`);
  if (r.listingErrors.length) parts.push(`ошибки списка: ${r.listingErrors.join("; ")}`);
  return parts.join(" · ");
}
