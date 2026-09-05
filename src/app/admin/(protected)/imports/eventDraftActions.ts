"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { logImportRun } from "@/lib/importRun";
import { createEventFromTtmImport } from "../events/importActions";
import {
  approveEventDraftsBatch,
  summarizeEventDraftsBatch,
  ttmDraftSubmission,
} from "./eventDraftsBatch";
import { progressWriter } from "./progressWriter";

// Очередь черновиков краулера афиши (вкладка «События» в импортах, см.
// docs/features/ttm-crawl.md): владелец смотрит каждый черновик и
// решает. До «Одобрить» в публичной таблице Event ничего нет.
// Массовые действия работают только по явно выбранным черновикам —
// кнопки «одобрить все» нет намеренно, владелец смотрит каждый.

/**
 * «Одобрить»: создаёт событие СУЩЕСТВУЮЩИМ путём «события по ссылке»
 * (createEventFromTtmImport) — постер скачивается к нам, состав
 * привязывается, всё в одной транзакции. К событию привязываются ТОЛЬКО
 * совпавшие с каталогом артисты: остальной состав спарсен эвристикой
 * (см. parseArtistLine) и без ручной проверки новых исполнителей не
 * заводим — они всегда добираются руками в карточке события.
 *
 * Ошибка (например, на странице не было даты) уезжает в query-параметр
 * и рисуется над очередью: текст исключения из экшена в проде до
 * клиента не доезжает.
 */
export async function approveEventDraft(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("draftId") ?? "");
  const draft = await prisma.eventDraft.findUnique({ where: { id } });

  let error: string | null = null;
  if (!draft || draft.status !== "PENDING") {
    error = "Черновик не найден или уже разобран";
  } else {
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
    } else {
      try {
        // Маппинг payload → данные импорта общий с пачкой одобрения
        // (см. ttmDraftSubmission): только совпавшие артисты, пресейл —
        // ссылкой на саму страницу TTM.
        const { id: eventId } = await createEventFromTtmImport(ttmDraftSubmission(draft));
        await prisma.eventDraft.update({
          where: { id },
          data: { status: "APPROVED", eventId, reviewedAt: new Date() },
        });
      } catch (e) {
        error =
          `Не удалось создать событие: ${e instanceof Error ? e.message : e}. ` +
          "Спарсите его руками через «Событие по ссылке» — там всё правится перед сохранением.";
      }
    }
  }

  revalidatePath("/admin/imports");
  revalidatePath("/admin");
  // redirect бросает свой NEXT_REDIRECT — потому вне try/catch.
  if (error) redirect(`/admin/imports?tab=events&draftError=${encodeURIComponent(error)}`);
}

/**
 * «Отклонить»: вечная память — повторный обход афиши REJECTED-черновик
 * не воскресит. Зовётся через ConfirmForm с bind(draftId), поэтому
 * ошибка возвращается объектом, а не исключением.
 */
export async function rejectEventDraft(draftId: string): Promise<{ error?: string } | void> {
  await requireAdmin();
  // updateMany с фильтром статуса: черновик могли разобрать в соседней
  // вкладке — тогда честно говорим об этом, а не молча «отклоняем».
  const updated = await prisma.eventDraft.updateMany({
    where: { id: draftId, status: "PENDING" },
    data: { status: "REJECTED", reviewedAt: new Date() },
  });
  if (updated.count === 0) return { error: "Черновик уже разобран" };
  revalidatePath("/admin/imports");
  revalidatePath("/admin");
}

/**
 * «Одобрить выбранные» из bulk-панели очереди: ПАЧКОЙ, одним фоновым
 * прогоном по образцу заявок MDL (одна карточка «Черновики событий:
 * одобрение» в журнале, прогресс «i из N», кнопка «Остановить» там же —
 * см. eventDraftsBatch.ts). События создаются последовательно
 * существующим createEventFromTtmImport с паузой между черновиками
 * (внутри поход за постером на TTM); ошибка одного пачку не роняет —
 * его черновик остаётся PENDING. Черновики с пометкой «возможный дубль»
 * пачка пропускает — их одобряют только точечно.
 *
 * Берём только ещё PENDING: черновик могли разобрать точечной кнопкой,
 * пока владелец собирал выделение.
 */
export async function approveSelectedEventDrafts(ids: string[]): Promise<void> {
  await requireAdmin();
  const drafts = await prisma.eventDraft.findMany({
    where: { id: { in: ids }, status: "PENDING" },
    // Порядок — как в очереди на странице: при остановке на середине
    // успевается то, что владелец видел первым.
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (drafts.length === 0) throw new Error("Среди выбранных не осталось черновиков в очереди");
  const draftIds = drafts.map((d) => d.id);

  // Фоном, как пачка заявок MDL: форма не ждёт походов за постерами.
  void (async () => {
    await logImportRun(
      "event-drafts",
      (runId) =>
        approveEventDraftsBatch(draftIds, { runId, onProgress: progressWriter(runId) }),
      summarizeEventDraftsBatch,
    ).catch(() => {
      // Падение уже записано в журнал самим logImportRun.
    });
  })();

  revalidatePath("/admin/imports");
  revalidatePath("/admin");
}

/** «Отклонить выбранные» из bulk-панели: то же, что точечное
 *  «Отклонить», но одним updateMany — синхронно, фоновый прогон тут не
 *  нужен. Черновики с пометкой «возможный дубль» отклоняются как
 *  обычные: отклонение и есть решение «это дубль». Разобранные по
 *  дороге фильтр молча пропускает. */
export async function rejectSelectedEventDrafts(ids: string[]): Promise<void> {
  await requireAdmin();
  await prisma.eventDraft.updateMany({
    where: { id: { in: ids }, status: "PENDING" },
    data: { status: "REJECTED", reviewedAt: new Date() },
  });
  revalidatePath("/admin/imports");
  revalidatePath("/admin");
}
