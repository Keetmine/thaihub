import { prisma } from "@/lib/prisma";
import {
  canonicalTtmEventUrl,
  scrapeTtmEvent,
  scrapeTtmListing,
  type TtmEvent,
  type TtmListingCard,
} from "@/lib/thaiticketmajor";
import { matchArtistsByNickname } from "@/lib/performerMatching";
import { decodeHtmlEntities, findCatalogDuplicate } from "@/lib/eventDedupe";
import { checkImportCancelled } from "@/lib/importRun";
import { notifyAdmins } from "@/lib/adminNotify";

// Краулер афиши ThaiTicketMajor (задача "ttm-crawl" в расписании, см.
// docs/features/ttm-crawl.md). Обходит две категории владельца —
// концерты и performance, — и для каждого нового события смотрит,
// есть ли в составе кто-то из нашего каталога. Совпало — черновик
// EventDraft PENDING в очередь на /admin/imports (вкладка «События»);
// публичной таблицы Event краулер не касается вовсе, событие создаёт
// только владелец кнопкой «Одобрить».

const LISTING_URLS = [
  "https://www.thaiticketmajor.com/concert/?lang=en",
  "https://www.thaiticketmajor.com/performance/?lang=en",
];

/** Потолок страниц событий за прогон: свежих карточек в категориях
 *  меньше сотни, и суточная задача с паузами не должна висеть часами. */
const MAX_EVENT_PAGES_PER_RUN = 40;

/** Пауза между страницами событий — вежливость к чужому сайту. */
const PAGE_PAUSE_MS = 1700;

/** NO_MATCH перепроверяется, когда прошлая проверка старше этого:
 *  артисты появляются в каталоге позже, чем событие в афише. */
const NO_MATCH_RECHECK_DAYS = 7;

/** Совпавший артист в EventDraft.matchedPerformers. */
export type EventDraftMatch = { performerId: string; nickname: string };

/** Тёзки, между которыми матчинг не выбрал (правка владельца
 *  2026-09-10). Едет в payload черновика, а не в matchedPerformers:
 *  привязки тут нет, это вопрос владельцу — «который из пяти Gun'ов?».
 *  Ответ даётся руками в карточке события после одобрения. */
export type EventDraftAmbiguity = {
  nickname: string;
  fullName: string;
  candidates: { id: string; name: string; realName: string | null; birthYear: number | null; type: string }[];
};

export type TtmCrawlResult = {
  /** Карточек на обеих списочных страницах (после дедупа). */
  cardsFound: number;
  /** Страниц событий реально скачано в этот прогон. */
  fetched: number;
  /** Новых черновиков PENDING (включая ожившие NO_MATCH). */
  newPending: number;
  /** Событий без совпадений с каталогом (запомнены как NO_MATCH). */
  noMatch: number;
  /** Сколько из скачанного — недельная перепроверка старых NO_MATCH. */
  rechecked: number;
  /** Пропущено уже известных URL (событие в каталоге или черновик). */
  skippedKnown: number;
  /** Сильных дублей: событие уже в каталоге под другим/пустым sourceUrl —
   *  черновик не создан, sourceUrl бэкфилнут (см. eventDedupe.ts). */
  duplicates: number;
  /** Черновиков с пометкой «возможный дубль» (слабое совпадение). */
  possibleDupes: number;
  /** Страниц, не скачавшихся/не разобравшихся (прогон не роняют). */
  failed: number;
  /** Ники совпавших артистов — в сводку прогона. */
  matchedNames: string[];
  /** Списочная страница не открылась (вторая при этом обходится). */
  listingErrors: string[];
};

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runTtmCrawl(
  opts: { runId?: string | null; maxEventPages?: number } = {},
): Promise<TtmCrawlResult> {
  const runId = opts.runId ?? null;
  const maxEventPages = opts.maxEventPages ?? MAX_EVENT_PAGES_PER_RUN;

  // 1. Списочные страницы — по разу за прогон, не чаще. Упавшая
  // категория не отменяет вторую; упали обе — прогон падает честно.
  const cards = new Map<string, TtmListingCard>();
  const listingErrors: string[] = [];
  for (const url of LISTING_URLS) {
    try {
      for (const card of await scrapeTtmListing(url)) {
        if (!cards.has(card.url)) cards.set(card.url, card);
      }
    } catch (e) {
      listingErrors.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (cards.size === 0 && listingErrors.length > 0) {
    throw new Error(`списочные страницы не открылись: ${listingErrors.join("; ")}`);
  }

  // 2. Память краулера: что из увиденного уже знаем.
  //  - URL уже в каталоге событий (Event.sourceUrl, включая события,
  //    заведённые руками через «событие по ссылке») — пропуск навсегда;
  //  - черновик PENDING/APPROVED/REJECTED — пропуск (REJECTED — вечная
  //    память, повторный обход решение владельца не воскрешает);
  //  - NO_MATCH старше недели — на перепроверку.
  const knownEvents = await prisma.event.findMany({
    where: { sourceUrl: { contains: "thaiticketmajor.com" } },
    select: { sourceUrl: true },
  });
  const knownEventUrls = new Set(
    knownEvents
      .map((e) => (e.sourceUrl ? canonicalTtmEventUrl(e.sourceUrl) : null))
      .filter((u): u is string => u !== null),
  );
  const drafts = await prisma.eventDraft.findMany({
    where: { sourceUrl: { in: [...cards.keys()] } },
    select: { sourceUrl: true, status: true, checkedAt: true },
  });
  const draftByUrl = new Map(drafts.map((d) => [d.sourceUrl, d]));

  const recheckBefore = new Date(Date.now() - NO_MATCH_RECHECK_DAYS * 24 * 60 * 60 * 1000);
  const fresh: TtmListingCard[] = [];
  const recheck: TtmListingCard[] = [];
  let skippedKnown = 0;
  for (const card of cards.values()) {
    if (knownEventUrls.has(card.url)) {
      skippedKnown++;
      continue;
    }
    const draft = draftByUrl.get(card.url);
    if (!draft) {
      fresh.push(card);
    } else if (draft.status === "NO_MATCH" && draft.checkedAt < recheckBefore) {
      recheck.push(card);
    } else {
      skippedKnown++;
    }
  }
  // Новые вперёд: при потолке перепроверка старых NO_MATCH подождёт до
  // следующего прогона, а свежее событие — нет.
  recheck.sort(
    (a, b) =>
      draftByUrl.get(a.url)!.checkedAt.getTime() - draftByUrl.get(b.url)!.checkedAt.getTime(),
  );
  const queue = [...fresh, ...recheck].slice(0, Math.max(0, maxEventPages));

  // 3. Страницы событий — существующим парсером, с паузой между ними.
  const result: TtmCrawlResult = {
    cardsFound: cards.size,
    fetched: 0,
    newPending: 0,
    noMatch: 0,
    rechecked: 0,
    skippedKnown,
    duplicates: 0,
    possibleDupes: 0,
    failed: 0,
    matchedNames: [],
    listingErrors,
  };

  for (const card of queue) {
    await checkImportCancelled(runId);
    if (result.fetched > 0) await pause(PAGE_PAUSE_MS);

    let scraped: TtmEvent;
    try {
      scraped = await scrapeTtmEvent(card.url);
      result.fetched++;
    } catch (e) {
      result.fetched++;
      result.failed++;
      console.warn(`ttm-crawl: ${card.url} ->`, e instanceof Error ? e.message : e);
      continue;
    }
    if (draftByUrl.has(card.url)) result.rechecked++;

    // Название с самой страницы события надёжнее карточки списка, но
    // бывает пустым при смене вёрстки — тогда берём карточку.
    if (!scraped.title) scraped = { ...scraped, title: card.title };
    // HTML-мнемоники (&#39;, &amp;) из JSON-LD и заголовков — в текст,
    // иначе «KRIST &#39;SILHOUETTES&#39;» доезжало до карточки как есть.
    scraped = {
      ...scraped,
      title: decodeHtmlEntities(scraped.title),
      venue: scraped.venue ? decodeHtmlEntities(scraped.venue) : scraped.venue,
    };

    // Дедуп по СОДЕРЖИМОМУ, не только по sourceUrl: у событий,
    // импортированных до того, как ссылка-источник начала сохраняться,
    // sourceUrl пуст (roadmap Э1.8), и по URL они «новые». Сильное
    // совпадение (название+даты, см. eventDedupe.ts) — событие уже в
    // каталоге: черновик владельцу не показываем, sourceUrl бэкфилим
    // (если пуст) — дальше быстрый путь по URL работает сам, — а URL
    // запоминаем черновиком APPROVED с eventId: тот же смысл, что у
    // «Одобрить» при уже существующем событии, и краулер такие URL
    // больше не трогает.
    const dupe = await findCatalogDuplicate(scraped);
    if (dupe && dupe.strength === "strong") {
      if (!dupe.eventSourceUrl) {
        await prisma.event.update({
          where: { id: dupe.eventId },
          data: { sourceUrl: card.url },
        });
      }
      const dupePayload = JSON.parse(JSON.stringify({ ...scraped, sourceUrl: card.url }));
      await prisma.eventDraft.upsert({
        where: { sourceUrl: card.url },
        create: {
          sourceUrl: card.url,
          payload: dupePayload,
          matchedPerformers: [],
          status: "APPROVED",
          eventId: dupe.eventId,
          reviewedAt: new Date(),
        },
        update: {
          payload: dupePayload,
          status: "APPROVED",
          eventId: dupe.eventId,
          reviewedAt: new Date(),
          checkedAt: new Date(),
        },
      });
      result.duplicates++;
      continue;
    }

    const artistMatches = await matchArtistsByNickname(scraped.artists);
    const matched: EventDraftMatch[] = artistMatches
      .filter((a) => a.matchedPerformerId !== null)
      .map((a) => ({ performerId: a.matchedPerformerId!, nickname: a.nickname }));
    // Тёзки: раньше матчинг молча выбирал одного из них, и в состав
    // события уезжал случайный человек. Теперь не выбирает никто —
    // список едет в черновик, решает владелец (правка 2026-09-10).
    const ambiguous: EventDraftAmbiguity[] = artistMatches
      .filter((a) => a.via === "ambiguous")
      .map((a) => ({ nickname: a.nickname, fullName: a.fullName, candidates: a.candidates }));

    // Слабое совпадение — решает владелец: черновик создаётся, но с
    // пометкой possibleDuplicateOf в payload — очередь рисует по ней
    // чип «Возможный дубль» со ссылкой на наше событие. В счётчик идут
    // только PENDING: NO_MATCH-черновик в очереди не виден, и сводка не
    // должна обещать чип, которого там нет (пометка при этом пишется и
    // ему — пригодится, если ожив на re-check).
    if (dupe && matched.length > 0) result.possibleDupes++;
    // Ключ дедупа — канонический адрес карточки, а не то, что вернул
    // парсер (он отдаёт URL, который дали ему, — он и так канонический,
    // но пусть это гарантирует одна точка).
    const payload = JSON.parse(
      JSON.stringify({
        ...scraped,
        sourceUrl: card.url,
        ...(ambiguous.length > 0 ? { ambiguousArtists: ambiguous } : {}),
        ...(dupe
          ? { possibleDuplicateOf: { eventId: dupe.eventId, eventTitle: dupe.eventTitle } }
          : {}),
      }),
    );

    // Черновик с одними тёзками тоже идёт в очередь: раньше такое
    // событие попадало в неё со СЛУЧАЙНОЙ привязкой, так что набор
    // черновиков не растёт — растёт только их честность.
    if (matched.length > 0 || ambiguous.length > 0) {
      const draft = await prisma.eventDraft.upsert({
        where: { sourceUrl: card.url },
        create: { sourceUrl: card.url, payload, matchedPerformers: matched, status: "PENDING" },
        // Оживший NO_MATCH: распарс и совпадения свежие, решения
        // владельца по нему ещё не было.
        update: { payload, matchedPerformers: matched, status: "PENDING", checkedAt: new Date() },
      });
      result.newPending++;
      result.matchedNames.push(...matched.map((m) => m.nickname));
      if (runId) {
        // След в журнале «последнего спарсенного» — история задачи на
        // вкладке расписания собирается из этих же строк (logsItems).
        await prisma.importedItem.create({
          data: {
            runId,
            entityType: "event-draft",
            entityId: draft.id,
            action: "created",
            label: scraped.title || card.url,
          },
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

  // 4. Одно уведомление на прогон, не по сообщению на черновик.
  if (result.newPending > 0) {
    const appUrl = process.env.APP_URL || "";
    await notifyAdmins(
      "import",
      `Черновики событий: +${result.newPending}, ждут проверки` +
        (appUrl ? `\n${appUrl}/admin/imports?tab=events` : ""),
      { dedupKey: runId ?? "ttm-crawl" },
    );
  }

  return result;
}

/** Сводка прогона — общая для журнала импортов и строки расписания. */
export function summarizeTtmCrawl(r: TtmCrawlResult): string {
  const names = [...new Set(r.matchedNames)];
  return (
    `карточек ${r.cardsFound}, скачано страниц ${r.fetched}, черновиков +${r.newPending}` +
    (names.length ? ` (${names.slice(0, 8).join(", ")})` : "") +
    (r.duplicates ? `, дублей закрыто ${r.duplicates}` : "") +
    (r.possibleDupes ? `, возможных дублей ${r.possibleDupes}` : "") +
    `, без совпадений ${r.noMatch}` +
    (r.rechecked ? `, перепроверено ${r.rechecked}` : "") +
    `, знакомых пропущено ${r.skippedKnown}` +
    (r.failed ? `, не открылось ${r.failed}` : "") +
    (r.listingErrors.length ? ` · листинг: ${r.listingErrors.join("; ")}` : "")
  );
}
