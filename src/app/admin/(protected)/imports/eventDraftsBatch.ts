import { prisma } from "@/lib/prisma";
import { checkImportCancelled, isImportCancelledError } from "@/lib/importRun";
import type { TtmEvent } from "@/lib/thaiticketmajor";
import type { EventDraftMatch } from "@/lib/ttmCrawl";
import type { PossibleDuplicate } from "@/lib/eventDedupe";
import {
  createEventFromTtmImport,
  type TtmImportSubmission,
} from "../events/importActions";

// Пачка одобрения черновиков краулера афиши (EventDraft, вкладка
// «События» в импортах) ОДНИМ фоновым прогоном — по образцу
// mdlRequestsBatch.ts: одна карточка в журнале, события создаются
// последовательно существующим createEventFromTtmImport (внутри поход
// за постером на TTM — потому пауза между черновиками), ошибка одного
// пачку не роняет: его черновик остаётся PENDING и виден в очереди.
//
// «Одобрить все» у черновиков НЕТ намеренно: владелец смотрит каждый,
// массово одобряются только явно выбранные. Черновики с пометкой
// «возможный дубль» (possibleDuplicateOf в payload, см. eventDedupe.ts)
// пачка ПРОПУСКАЕТ — сравнить с существующим событием может только
// человек, такие одобряются точечно.

/** Пауза между созданиями событий: у каждого — поход за постером на
 *  TTM (downloadRemoteImage), мы в гостях. */
const APPROVE_PAUSE_MS = 1200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Payload черновика — распарс TtmEvent плюс пометка матчинга дублей. */
export type EventDraftPayload = Partial<TtmEvent> & {
  possibleDuplicateOf?: PossibleDuplicate;
};

/**
 * Черновик → данные для createEventFromTtmImport. Одна точка на оба
 * пути одобрения (точечная кнопка и пачка): к событию привязываются
 * ТОЛЬКО совпавшие с каталогом артисты (extraPerformerIds) — остальной
 * состав спарсен эвристикой и без ручной проверки не заводится.
 */
export function ttmDraftSubmission(draft: {
  sourceUrl: string;
  payload: unknown;
  matchedPerformers: unknown;
}): TtmImportSubmission {
  const payload = draft.payload as EventDraftPayload;
  const matched = (draft.matchedPerformers as EventDraftMatch[] | null) ?? [];
  const hasPresale = Boolean(payload.presaleDate && payload.presaleTime);
  return {
    title: payload.title ?? "",
    venue: payload.venue ?? "",
    date: payload.date ?? "",
    startTime: payload.startTime ?? "",
    endTime: "",
    extraDates: payload.extraDates ?? [],
    description: payload.description ?? "",
    dramaId: "",
    ticketPrice: payload.ticketPrice ?? "",
    posterUrl: payload.posterUrl ?? "",
    presaleDate: hasPresale ? payload.presaleDate! : "",
    presaleTime: hasPresale ? payload.presaleTime! : "",
    // Как в ручном импорте: покупают билеты на самой странице TTM.
    presaleUrl: hasPresale ? draft.sourceUrl : "",
    sourceUrl: draft.sourceUrl,
    artists: [],
    extraPerformerIds: matched.map((m) => m.performerId),
  };
}

export type EventDraftsBatchResult = {
  total: number;
  /** Созданных событий (черновики стали APPROVED). */
  created: number;
  /** Событие с тем же sourceUrl уже было в каталоге — черновик просто
   *  связан с ним, дубль не создан (как у точечного «Одобрить»). */
  linked: number;
  failed: number;
  /** Названия неудавшихся: их черновики остались PENDING в очереди. */
  failedTitles: string[];
  /** Пропущено черновиков с пометкой «возможный дубль» — остались
   *  PENDING, одобряются только точечно. */
  skippedDupes: number;
  /** Разобраны, пока владелец собирал выделение (соседняя вкладка). */
  skippedResolved: number;
  /** Текст первой ошибки — в сводку: «не вышло 2» без причины не
   *  говорит, чинить ли черновик или страницу TTM. */
  firstError: string | null;
};

/**
 * Последовательное одобрение выбранных черновиков.
 *
 * Каждый черновик — тот же путь, что у точечного «Одобрить»
 * (eventDraftActions.ts): событие с этим sourceUrl уже есть — линкуем,
 * иначе createEventFromTtmImport (одна транзакция, постер скачивается к
 * нам). Ошибка одного черновика НЕ роняет пачку: он остаётся PENDING и
 * попадает в «не вышло» сводки — заводится руками через «событие по
 * ссылке». Остановка кнопкой в журнале — выход целиком, уже созданное
 * остаётся.
 */
export async function approveEventDraftsBatch(
  draftIds: string[],
  opts: {
    runId: string;
    onProgress?: (message: string) => void;
    /** Тестовый шов: создать событие без похода за постером и без
     *  requireAdmin. Без него — боевой createEventFromTtmImport. */
    createEvent?: (data: TtmImportSubmission) => Promise<{ id: string }>;
    /** Пауза между созданиями; в тестах 0. */
    delayMs?: number;
  },
): Promise<EventDraftsBatchResult> {
  // Без ревалидации: пачка живёт в отвязанном от запроса промисе, где
  // revalidatePath бросает (см. шов в createEventFromTtmImport).
  const createEvent =
    opts.createEvent ??
    ((data: TtmImportSubmission) => createEventFromTtmImport(data, { revalidate: false }));
  const delayMs = opts.delayMs ?? APPROVE_PAUSE_MS;

  const result: EventDraftsBatchResult = {
    total: draftIds.length,
    created: 0,
    linked: 0,
    failed: 0,
    failedTitles: [],
    skippedDupes: 0,
    skippedResolved: 0,
    firstError: null,
  };

  for (const [i, id] of draftIds.entries()) {
    await checkImportCancelled(opts.runId);

    // Черновик перечитывается на каждом шаге: пока пачка шла, его могли
    // разобрать точечной кнопкой или соседним прогоном.
    const draft = await prisma.eventDraft.findUnique({ where: { id } });
    if (!draft || draft.status !== "PENDING") {
      result.skippedResolved++;
      continue;
    }
    const payload = draft.payload as EventDraftPayload;
    const title = payload.title || draft.sourceUrl;
    opts.onProgress?.(`Одобряем ${i + 1} из ${draftIds.length}: ${title}`);

    // Жёлтый чип «возможный дубль» — решение человека, не пачки:
    // черновик остаётся PENDING, в сводке — «одобряйте точечно».
    if (payload.possibleDuplicateOf) {
      result.skippedDupes++;
      continue;
    }

    // Событие могли завести руками, пока черновик ждал: не плодим
    // дубль, а просто связываем черновик с существующим.
    const existing = await prisma.event.findFirst({
      where: { sourceUrl: draft.sourceUrl },
      select: { id: true },
    });
    if (existing) {
      await prisma.eventDraft.update({
        where: { id },
        data: { status: "APPROVED", eventId: existing.id, reviewedAt: new Date() },
      });
      result.linked++;
      continue;
    }

    try {
      // Пауза — перед каждым СОЗДАНИЕМ после первого: платит её только
      // поход за постером, пропуски и линковки идут без задержки.
      if (result.created > 0 && delayMs > 0) await sleep(delayMs);
      const { id: eventId } = await createEvent(ttmDraftSubmission(draft));
      await prisma.eventDraft.update({
        where: { id },
        data: { status: "APPROVED", eventId, reviewedAt: new Date() },
      });
      result.created++;
      // След в «последнем спарсенном» — по этим же строкам остановка
      // кнопкой считает «успели: N» (см. logImportRun).
      await prisma.importedItem.create({
        data: {
          runId: opts.runId,
          entityType: "event",
          entityId: eventId,
          action: "created",
          label: title,
        },
      });
    } catch (e) {
      // Остановка кнопкой — не ошибка черновика: выходим целиком.
      if (isImportCancelledError(e)) throw e;
      result.failed++;
      result.failedTitles.push(title);
      result.firstError ??= e instanceof Error ? e.message : String(e);
    }
  }

  return result;
}

/** Сводка для журнала: «создано X, не вышло Y» — и что пропущенные
 *  дубли ждут точечного решения, а не потерялись. */
export function summarizeEventDraftsBatch(r: EventDraftsBatchResult): string {
  return (
    `черновиков ${r.total}: создано ${r.created}` +
    (r.linked ? `, связано с уже существующими ${r.linked}` : "") +
    `, не вышло ${r.failed}` +
    (r.failedTitles.length > 0 ? ` (${r.failedTitles.join(", ").slice(0, 200)})` : "") +
    (r.firstError ? ` · ${r.firstError.slice(0, 200)}` : "") +
    (r.skippedDupes
      ? `, пропущено как возможные дубли: ${r.skippedDupes} — одобряйте точечно`
      : "") +
    (r.skippedResolved ? `, уже разобрано без нас: ${r.skippedResolved}` : "")
  );
}
