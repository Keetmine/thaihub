import { prisma } from "@/lib/prisma";
import { checkImportCancelled } from "@/lib/importRun";
import { notifyAdmins } from "@/lib/adminNotify";
import { findCatalogDuplicate } from "@/lib/eventDedupe";
import {
  loadTagCatalog,
  matchArtistsByNickname,
  matchCatalogInText,
  type TagCatalog,
} from "@/lib/performerMatching";
import type { EventDraftAmbiguity, EventDraftMatch } from "@/lib/ttmCrawl";
import type { TtmEvent } from "@/lib/thaiticketmajor";
import {
  scrapeAaraEvent,
  scrapeAaraListing,
  splitAaraLineup,
  type AaraCard,
  type AaraEvent,
  type AaraListingKind,
} from "@/lib/aara";

/**
 * Краулер a-ara.co.jp: список → страницы событий → черновики в ту же
 * очередь на одобрение, что и афиша ThaiTicketMajor и обход thaistarx
 * (см. ttm-crawl.md). Само в каталог ничего не попадает — владелец
 * одобряет или отклоняет каждое.
 *
 * Разбор страниц — в `aara.ts`, здесь только решения: кого брать, что
 * считать дублем, кого привязать к событию.
 *
 * **Берём только тех, кто есть у нас в каталоге** (решение владельца
 * 2026-09-25: «только тайцев давай пока»). Это не проверка страны, а
 * проверка по нашему же каталогу: он тайский, поэтому корейские и
 * тайваньские гастроли того же промоутера отсеиваются сами, без
 * угадывания национальности по имени. Не совпавшее запоминается со
 * статусом NO_MATCH и перепроверяется через неделю: каталог растёт, и
 * вчерашний незнакомец сегодня уже заведён.
 */

/** Страниц списка за прогон: суточный обход останавливается раньше —
 *  на первой странице, где всё знакомо; архив листает до конца (на
 *  2026-09-25 — 5 страниц). */
const MAX_LISTING_PAGES: Record<AaraListingKind, number> = { recent: 3, archive: 20 };
/** Потолок страниц событий за прогон. */
const MAX_PAGES_PER_RUN: Record<AaraListingKind, number> = { recent: 30, archive: 120 };
const PAGE_PAUSE_MS = 1500;
const LISTING_PAUSE_MS = 1200;
/** NO_MATCH перепроверяется, когда прошлая проверка старше этого. */
const NO_MATCH_RECHECK_DAYS = 7;

/** Японская сцена — японское время. Храним «часы на стене», как и
 *  остальные события (см. lib/dates.ts), а зона едет отдельным полем. */
const AARA_TIMEZONE = "Asia/Tokyo";

/** Цена на странице — простыня с условиями; в карточку берём начало. */
const PRICE_LIMIT = 300;

export type AaraDraftPayload = TtmEvent & {
  presaleUrl: string | null;
  timezone: string | null;
  aara: {
    dates: string[];
    times: string[];
    slots: { date: string; time: string | null }[];
    whenText: string | null;
    city: string | null;
    lineupText: string | null;
    kindText: string | null;
    variant: string | null;
    reviewNotes: string[];
  };
  ambiguousArtists?: EventDraftAmbiguity[];
  possibleDuplicateOf?: { eventId: string; eventTitle: string };
};

/**
 * Страница события → черновик.
 *
 * Про сеансы: `TtmEvent` умеет «одно время + список дополнительных
 * ДНЕЙ», а здесь у 29 карточек из 43 в один день ДВА сеанса. Второй
 * сеанс в эту форму не влезает, поэтому в черновик идёт первый, а все
 * разобранные сеансы лежат в `aara.slots` и попадают в пометки к
 * проверке — чтобы владелец добавил вторую дату руками, а не узнал о
 * ней от зрителей.
 */
export function buildAaraPayload(ev: AaraEvent): AaraDraftPayload {
  const [first, ...rest] = ev.slots;
  // Дополнительные ДНИ (не сеансы того же дня): очередь одобрения
  // раскладывает их в отдельные даты события.
  const extraDates = [...new Set(rest.map((s) => s.date))].filter((d) => d !== first?.date);
  const sameDayShows = ev.slots.filter((s) => s.date === first?.date && s.time);

  const reviewNotes = [...ev.reviewNotes];
  if (sameDayShows.length > 1) {
    reviewNotes.push(
      `в один день ${sameDayShows.length} сеанса (${sameDayShows
        .map((s) => s.time)
        .join(", ")}) — в черновик попал первый`,
    );
  }

  return {
    title: ev.title,
    // Город приписываем к площадке: «品川ザ・グランドホール (東京)» —
    // иначе из карточки не понять, Токио это или Осака.
    venue: ev.venue ? (ev.city ? `${ev.venue} (${ev.city})` : ev.venue) : null,
    posterUrl: ev.posterUrl,
    date: first?.date ?? null,
    startTime: first?.time ?? null,
    extraDates,
    dateRangeText: ev.whenText,
    ticketPrice: ev.priceText ? ev.priceText.slice(0, PRICE_LIMIT) : null,
    description: ev.kindText,
    presaleDate: null,
    presaleTime: null,
    artists: [],
    sourceUrl: ev.sourceUrl,
    presaleUrl: ev.ticketUrl,
    timezone: AARA_TIMEZONE,
    aara: {
      dates: ev.dates,
      times: ev.times,
      slots: ev.slots,
      whenText: ev.whenText,
      city: ev.city,
      lineupText: ev.lineupText,
      kindText: ev.kindText,
      variant: ev.variant,
      reviewNotes,
    },
  };
}

/**
 * Состав — двумя способами сразу, потому что строка «出演» бывает и
 * списком, и прозой:
 *
 *  1. **по кускам списка** — «UP / POOM», «GEN1 (ZEE/MAX/MARK/…)»
 *     режутся по разделителям, и каждый кусок сверяется с каталогом
 *     ТОЧНО. Только так находятся короткие ники: «BUILD», «NET»,
 *     «ZEE» — искать их внутри текста нельзя, это обычные слова;
 *  2. **по прозе** — «BOSS NOEUL FORT PEAT SUNNY …» перечислены через
 *     пробел, разрезать такое нечем; там работает поиск знакомых имён
 *     внутри строки (`matchCatalogInText`, тот же приём, что у тегов
 *     thaistarx). Ему же достаётся название карточки: у части событий
 *     состав записан только в нём.
 *
 * Первый способ нашёл ровно то, что терял второй: GEN1 с семью
 * участниками, сольники Build и Net, фансайны BOSSCKM.
 */
export async function matchAaraArtists(
  ev: AaraEvent,
  catalog: TagCatalog,
): Promise<{ matched: EventDraftMatch[]; ambiguous: EventDraftAmbiguity[] }> {
  const matched: EventDraftMatch[] = [];
  const ambiguous: EventDraftAmbiguity[] = [];
  const addMatch = (performerId: string, nickname: string) => {
    if (!matched.some((m) => m.performerId === performerId)) matched.push({ performerId, nickname });
  };
  const addAmbiguous = (a: EventDraftAmbiguity) => {
    if (!ambiguous.some((x) => x.nickname.toLowerCase() === a.nickname.toLowerCase())) {
      ambiguous.push(a);
    }
  };

  const tokens = splitAaraLineup(ev.lineupText);
  if (tokens.length > 0) {
    for (const a of await matchArtistsByNickname(tokens.map((t) => ({ fullName: "", nickname: t })))) {
      if (a.matchedPerformerId) addMatch(a.matchedPerformerId, a.nickname);
      else if (a.via === "ambiguous") {
        addAmbiguous({ nickname: a.nickname, fullName: a.fullName, candidates: a.candidates });
      }
    }
  }

  const prose = matchCatalogInText([ev.lineupText, ev.title].filter(Boolean).join(" \n "), catalog);
  for (const m of prose.matched) addMatch(m.performerId, m.nickname);
  for (const a of prose.ambiguous) {
    addAmbiguous({ nickname: a.nickname, fullName: a.fullName, candidates: a.candidates });
  }

  // Тёзка, которого уже развёл точный матч, из «неясных» уходит.
  const matchedIds = new Set(matched.map((m) => m.performerId));
  return {
    matched,
    ambiguous: ambiguous.filter((a) => !a.candidates.some((c) => matchedIds.has(c.id))),
  };
}

export type AaraPlanItem = {
  url: string;
  title: string;
  dates: string[];
  matched: string[];
  ambiguous: string[];
  status: "PENDING" | "NO_MATCH" | "DUPLICATE" | "VARIANT" | "FAILED";
};

export type AaraCrawlResult = {
  listing: AaraListingKind;
  listingPages: number;
  cardsFound: number;
  fetched: number;
  newPending: number;
  noMatch: number;
  rechecked: number;
  skippedKnown: number;
  /** Карточки-допродажи (【Benefit】 и прочие без таблицы). */
  variants: number;
  duplicates: number;
  possibleDupes: number;
  failed: number;
  matchedNames: string[];
  listingErrors: string[];
  plan: AaraPlanItem[];
};

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runAaraCrawl(
  opts: {
    listing?: AaraListingKind;
    runId?: string | null;
    maxPages?: number;
    apply?: boolean;
  } = {},
): Promise<AaraCrawlResult> {
  const listing = opts.listing ?? "recent";
  const runId = opts.runId ?? null;
  const apply = opts.apply ?? true;
  const maxPages = opts.maxPages ?? MAX_PAGES_PER_RUN[listing];

  const result: AaraCrawlResult = {
    listing,
    listingPages: 0,
    cardsFound: 0,
    fetched: 0,
    newPending: 0,
    noMatch: 0,
    rechecked: 0,
    skippedKnown: 0,
    variants: 0,
    duplicates: 0,
    possibleDupes: 0,
    failed: 0,
    matchedNames: [],
    listingErrors: [],
    plan: [],
  };

  // 1. Память краулера. Адрес уже в каталоге — пропуск навсегда;
  // черновик PENDING/APPROVED/REJECTED — пропуск; NO_MATCH старше
  // недели — перепроверка.
  const known = await prisma.event.findMany({
    where: { sourceUrl: { contains: "a-ara.co.jp" } },
    select: { sourceUrl: true },
  });
  const knownUrls = new Set(known.map((e) => e.sourceUrl!));
  const drafts = await prisma.eventDraft.findMany({
    where: { sourceUrl: { contains: "a-ara.co.jp" } },
    select: { sourceUrl: true, status: true, checkedAt: true },
  });
  const draftByUrl = new Map(drafts.map((d) => [d.sourceUrl, d]));
  const recheckBefore = new Date(Date.now() - NO_MATCH_RECHECK_DAYS * 24 * 60 * 60 * 1000);
  const isKnown = (url: string) => {
    if (knownUrls.has(url)) return true;
    const d = draftByUrl.get(url);
    if (!d) return false;
    return !(d.status === "NO_MATCH" && d.checkedAt < recheckBefore);
  };

  // 2. Список. Архив и текущая афиша — РАЗНЫЕ разделы сайта, поэтому
  // архивный прогон идёт по обоим: у промоутера событие переезжает из
  // /event/ в /past_events/, когда пройдёт.
  const sections: AaraListingKind[] = listing === "archive" ? ["recent", "archive"] : ["recent"];
  const cards = new Map<string, AaraCard>();
  for (const section of sections) {
    for (let page = 1; page <= MAX_LISTING_PAGES[listing]; page++) {
      await checkImportCancelled(runId);
      if (result.listingPages > 0) await pause(LISTING_PAUSE_MS);
      let pageCards: AaraCard[];
      try {
        pageCards = await scrapeAaraListing(section, page);
        result.listingPages++;
      } catch (e) {
        result.listingErrors.push(e instanceof Error ? e.message : String(e));
        break;
      }
      if (pageCards.length === 0) break;
      let fresh = 0;
      let added = 0;
      for (const card of pageCards) {
        if (!cards.has(card.url)) {
          cards.set(card.url, card);
          added++;
        }
        if (!isKnown(card.url)) fresh++;
      }
      // Ничего нового на странице — дальше та же выдача (у WordPress
      // страница за последней отдаёт последнюю).
      if (added === 0) break;
      if (listing === "recent" && fresh === 0) break;
    }
  }
  if (cards.size === 0 && result.listingErrors.length > 0) {
    throw new Error(`список не открылся: ${result.listingErrors.join("; ")}`);
  }
  result.cardsFound = cards.size;

  const fresh: AaraCard[] = [];
  const recheck: AaraCard[] = [];
  for (const card of cards.values()) {
    if (knownUrls.has(card.url)) {
      result.skippedKnown++;
      continue;
    }
    const d = draftByUrl.get(card.url);
    if (!d) fresh.push(card);
    else if (d.status === "NO_MATCH" && d.checkedAt < recheckBefore) recheck.push(card);
    else result.skippedKnown++;
  }
  const queue = [...fresh, ...recheck].slice(0, Math.max(0, maxPages));
  if (queue.length === 0) return result;

  const catalog = await loadTagCatalog();

  // 3. Страницы событий — по одной, с паузой: чужой сайт.
  for (const card of queue) {
    await checkImportCancelled(runId);
    if (result.fetched > 0) await pause(PAGE_PAUSE_MS);

    let ev: AaraEvent;
    try {
      ev = await scrapeAaraEvent(card.url);
      result.fetched++;
    } catch (e) {
      result.fetched++;
      result.failed++;
      console.warn(`aara-crawl: ${card.url} ->`, e instanceof Error ? e.message : e);
      continue;
    }
    if (draftByUrl.has(card.url)) result.rechecked++;
    if (!ev.title) ev = { ...ev, title: card.title };

    // 3a. Допродажа (【Benefit】, 【VIP】): у неё нет таблицы с датой, и
    // событием она не является — это второй билет на уже заведённое.
    // Запоминаем, чтобы не открывать её каждый прогон.
    if (!ev.standalone) {
      result.variants++;
      result.plan.push({ url: card.url, title: ev.title, dates: [], matched: [], ambiguous: [], status: "VARIANT" });
      if (apply) {
        const payload = JSON.parse(JSON.stringify(buildAaraPayload(ev)));
        await prisma.eventDraft.upsert({
          where: { sourceUrl: card.url },
          create: { sourceUrl: card.url, payload, matchedPerformers: [], status: "NO_MATCH" },
          update: { payload, checkedAt: new Date() },
        });
      }
      continue;
    }

    const basePayload = buildAaraPayload(ev);

    // 3b. Событие уже в каталоге — черновик не показываем, адрес
    // бэкфилим (см. eventDedupe.ts).
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
      result.plan.push({ url: card.url, title: ev.title, dates: ev.dates, matched: [], ambiguous: [], status: "DUPLICATE" });
      continue;
    }

    // 3c. Состав — он же фильтр «наши / не наши».
    const { matched, ambiguous } = await matchAaraArtists(ev, catalog);
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
      title: ev.title,
      dates: ev.dates,
      matched: matched.map((m) => m.nickname),
      ambiguous: ambiguous.map((a) => a.nickname),
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
          data: { runId, entityType: "event-draft", entityId: draft.id, action: "created", label: ev.title || card.url },
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
      `a-ara: черновиков событий +${result.newPending}, ждут проверки` +
        (appUrl ? `\n${appUrl}/admin/imports?tab=events` : ""),
      { dedupKey: runId ?? "aara-crawl" },
    );
  }
  return result;
}

/** Сводка прогона — для журнала импортов и строки расписания. */
export function summarizeAaraCrawl(r: AaraCrawlResult): string {
  const names = [...new Set(r.matchedNames)];
  const parts = [
    `${r.listing === "archive" ? "архив" : "новое"}: страниц списка ${r.listingPages}, карточек ${r.cardsFound}`,
    `скачано ${r.fetched}`,
    `черновиков +${r.newPending}` +
      (names.length ? ` (${names.slice(0, 12).join(", ")}${names.length > 12 ? "…" : ""})` : ""),
    `не наши ${r.noMatch}`,
    `допродаж ${r.variants}`,
    `уже в каталоге ${r.duplicates}`,
    `пропущено знакомых ${r.skippedKnown}`,
  ];
  if (r.possibleDupes) parts.push(`возможных дублей ${r.possibleDupes}`);
  if (r.failed) parts.push(`не разобралось ${r.failed}`);
  if (r.listingErrors.length) parts.push(`ошибки списка: ${r.listingErrors.join("; ")}`);
  return parts.join(" · ");
}
