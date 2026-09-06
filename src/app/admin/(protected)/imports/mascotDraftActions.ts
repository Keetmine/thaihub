"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { downloadRemoteImage } from "@/lib/localImage";
import { normalizeMascotName, type MascotDraftPayload } from "@/lib/gmmtvMascots";
import { logAudit } from "@/lib/audit";
import type { MatchedMascotOwner } from "@/lib/performerMatching";

// Очередь черновиков маскотов с вики GMMTV (вкладка «Маскоты» в
// импортах, см. docs/features/gmmtv-mascots-import.md): владелец смотрит
// каждый черновик и решает. До «Одобрить» в публичной таблице Performer
// ничего нет. Кроме точечных кнопок есть массовые — по выделенным
// строкам (просьба владельца 2026-09-06: «везде в админке, где списки,
// нужен множественный выбор»); прогон синхронный, потому что маскотов
// за раз единицы, а не сотни, как черновиков событий.

/**
 * «Одобрить»: создаёт Performer типа MASCOT — картинка скачивается к
 * нам (downloadRemoteImage, как у остальных импортов), описание с вики
 * ложится в bio, совпавшие владельцы привязываются строками MascotOwner.
 * Владельцы перепроверяются в момент одобрения (тот же серверный guard
 * «только SOLO/BAND», что у getMascotOwnerData в performers/actions.ts):
 * пока черновик ждал, каталог мог измениться. Если маскота с таким
 * именем успели завести руками — не плодим дубль, просто линкуем.
 *
 * Ошибка уезжает в query-параметр и рисуется над очередью: текст
 * исключения из экшена в проде до клиента не доезжает.
 */
export async function approveMascotDraft(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("draftId") ?? "");
  const error = await approveOneMascotDraft(id);

  revalidatePath("/admin/imports");
  revalidatePath("/admin");
  revalidatePath("/admin/performers");
  revalidatePath("/artists");
  // redirect бросает свой NEXT_REDIRECT — потому вне try/catch.
  if (error) redirect(`/admin/imports?tab=mascots&mascotError=${encodeURIComponent(error)}`);
}

/**
 * Одобрение одного черновика без переходов и revalidate — общая
 * середина точечной кнопки и массового действия. Возвращает текст
 * ошибки или null: у пачки на ошибке одного останавливаться нельзя,
 * остальные должны разобраться.
 */
async function approveOneMascotDraft(id: string): Promise<string | null> {
  const draft = await prisma.mascotDraft.findUnique({ where: { id } });

  let error: string | null = null;
  if (!draft || draft.status !== "PENDING") {
    error = "Черновик не найден или уже разобран";
  } else {
    try {
      const payload = draft.payload as MascotDraftPayload;
      // Маскота могли завести руками, пока черновик ждал: сравниваем
      // тем же нормализованным именем, что и краулер.
      const catalogMascots = await prisma.performer.findMany({
        where: { type: "MASCOT" },
        select: { id: true, name: true },
      });
      const existing = catalogMascots.find(
        (p) => normalizeMascotName(p.name) === draft.nameKey,
      );
      let performerId: string;
      if (existing) {
        performerId = existing.id;
      } else {
        const matched = (draft.matchedOwners as MatchedMascotOwner[] | null) ?? [];
        const owners = matched.length
          ? await prisma.performer.findMany({
              where: {
                id: { in: matched.map((m) => m.performerId) },
                type: { in: ["SOLO", "BAND"] },
              },
              select: { id: true },
            })
          : [];
        // Картинку забираем к себе ДО записи; не скачалось —
        // downloadRemoteImage вернёт исходный URL (как у blscene).
        const photoUrl = await downloadRemoteImage(payload.imageUrl ?? null, "performers");
        const created = await prisma.performer.create({
          data: {
            name: draft.name,
            type: "MASCOT",
            photoUrl,
            bio: payload.description || null,
            sourceUrl: draft.sourceUrl,
            mascotOwners: { create: owners.map((o) => ({ performerId: o.id })) },
          },
        });
        performerId = created.id;
        // История правок: карточка маскота пришла из вики-краулера
        // (одобрена админом — его имя запишется автором).
        await logAudit({
          action: "CREATE",
          entityType: "Performer",
          entityId: created.id,
          entityLabel: draft.name,
          note: "черновик маскота с вики GMMTV",
        });
      }
      await prisma.mascotDraft.update({
        where: { id },
        data: { status: "APPROVED", performerId, reviewedAt: new Date() },
      });
    } catch (e) {
      error = `Не удалось создать маскота: ${e instanceof Error ? e.message : e}`;
    }
  }
  return error;
}

/**
 * «Одобрить выбранные» из панели массовых действий. Идёт по очереди в
 * том же порядке, что на странице, и НЕ падает на первом же спотыкании:
 * что удалось — заведено, про остальное честно говорится в конце
 * (текст исключения BulkList покажет в панели). Фонового прогона, как у
 * черновиков событий, здесь нет намеренно: маскотов за раз единицы, и
 * ждать десяток секунд понятнее, чем искать ход в журнале.
 */
export async function approveSelectedMascotDrafts(ids: string[]): Promise<void> {
  await requireAdmin();
  const drafts = await prisma.mascotDraft.findMany({
    where: { id: { in: ids }, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true },
  });
  if (drafts.length === 0) throw new Error("Среди выбранных не осталось черновиков в очереди");

  const failed: string[] = [];
  for (const draft of drafts) {
    const error = await approveOneMascotDraft(draft.id);
    if (error) failed.push(`${draft.name}: ${error}`);
  }

  revalidatePath("/admin/imports");
  revalidatePath("/admin");
  revalidatePath("/admin/performers");
  revalidatePath("/artists");

  if (failed.length > 0) {
    throw new Error(
      `Заведено ${drafts.length - failed.length} из ${drafts.length}. Не получилось: ${failed.join("; ")}`,
    );
  }
}

/** «Отклонить выбранные»: то же, что точечное «Отклонить», одним
 *  updateMany. Разобранные по дороге фильтр статуса молча пропускает. */
export async function rejectSelectedMascotDrafts(ids: string[]): Promise<void> {
  await requireAdmin();
  await prisma.mascotDraft.updateMany({
    where: { id: { in: ids }, status: "PENDING" },
    data: { status: "REJECTED", reviewedAt: new Date() },
  });
  revalidatePath("/admin/imports");
  revalidatePath("/admin");
}

/**
 * «Отклонить»: вечная память — повторный обход вики REJECTED-черновик
 * не воскресит. Зовётся через ConfirmForm с bind(draftId), поэтому
 * ошибка возвращается объектом, а не исключением.
 */
export async function rejectMascotDraft(draftId: string): Promise<{ error?: string } | void> {
  await requireAdmin();
  // updateMany с фильтром статуса: черновик могли разобрать в соседней
  // вкладке — тогда честно говорим об этом, а не молча «отклоняем».
  const updated = await prisma.mascotDraft.updateMany({
    where: { id: draftId, status: "PENDING" },
    data: { status: "REJECTED", reviewedAt: new Date() },
  });
  if (updated.count === 0) return { error: "Черновик уже разобран" };
  revalidatePath("/admin/imports");
  revalidatePath("/admin");
}
