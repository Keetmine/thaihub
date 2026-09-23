"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCatalogEditor } from "@/lib/auth";
import { logImportRun } from "@/lib/importRun";
import { refreshMissingPerformerBios, summarizePerformerBioRun } from "@/lib/mdlPerformerSync";
import { progressWriter } from "../../imports/progressWriter";

/** Журнальный kind обхода — тот же, что у задачи по расписанию
 *  («mdl-performer-bios» в JOB_DEFINITIONS): прогоны с кнопки и ночные
 *  лежат в одной ленте, и «уже идёт» видно независимо от того, кто его
 *  начал. */
const KIND = "mdl-performer-bios";

/**
 * «Обойти сейчас» — та же пачка, что берёт планировщик, но по кнопке.
 *
 * Запускаем ФОНОМ и сразу отвечаем странице: пачка из полутора сотен
 * карточек идёт минуты, и держать всё это время server action нельзя —
 * запрос отвалится по таймауту, а прогон останется висеть без хозяина.
 * Ход и кнопка «Остановить» — на этой же странице (прогресс пишется в
 * ImportRun.summary) и в журнале /admin/imports.
 */
function launchBioSync(): void {
  void (async () => {
    await logImportRun(
      KIND,
      (runId) => refreshMissingPerformerBios({ runId, onProgress: progressWriter(runId) }),
      summarizePerformerBioRun,
    ).catch(() => {
      // Падение уже записано в журнал самим logImportRun.
    });
  })();
}

export async function runPerformerBioSync(): Promise<void> {
  await requireCatalogEditor();
  // Второй прогон параллельно первому — это два браузера на сервере с
  // 4 ГБ и двойная нагрузка на MDL; к тому же оба взяли бы из очереди
  // одних и тех же людей.
  const running = await prisma.importRun.findFirst({
    where: { kind: KIND, status: "RUNNING" },
    select: { id: true },
  });
  if (running) throw new Error("Обход уже идёт — дождитесь конца пачки или остановите её");

  launchBioSync();
  revalidatePath("/admin/performers/bios");
  revalidatePath("/admin/imports");
}

/**
 * «Проверить заново» тех, кого на MDL не нашли.
 *
 * Отметка `mdlSyncedAt` держит человека вне очереди — иначе каждая
 * пачка упиралась бы в одни и те же ненаходимые имена. Но со временем
 * появляются и страницы на MDL, и связи с сериалами, по которым
 * человека можно опознать, — поэтому очередь можно открыть заново
 * (просьба владельца: «потом опять запустить, когда понадобится»).
 * Сама отметка не врёт про биографию: bio у этих карточек как был
 * пустым, так и остался.
 */
export async function recheckNotFoundPerformers(): Promise<void> {
  await requireCatalogEditor();
  await prisma.performer.updateMany({
    where: { type: "SOLO", bio: null, mdlSyncedAt: { not: null } },
    data: { mdlSyncedAt: null },
  });
  revalidatePath("/admin/performers/bios");
}
