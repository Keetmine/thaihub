"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import type { TtmEvent } from "@/lib/thaiticketmajor";
import type { EventDraftMatch } from "@/lib/ttmCrawl";
import { createEventFromTtmImport } from "../events/importActions";

// Очередь черновиков краулера афиши (вкладка «События» в импортах, см.
// docs/features/ttm-crawl.md): владелец смотрит каждый черновик и
// решает. До «Одобрить» в публичной таблице Event ничего нет.

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
      const payload = draft.payload as unknown as Partial<TtmEvent>;
      const matched = (draft.matchedPerformers as EventDraftMatch[] | null) ?? [];
      const hasPresale = Boolean(payload.presaleDate && payload.presaleTime);
      try {
        const { id: eventId } = await createEventFromTtmImport({
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
        });
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
