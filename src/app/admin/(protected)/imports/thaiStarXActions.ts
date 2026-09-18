"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { logImportRun } from "@/lib/importRun";

// Разовый обход АРХИВА thaistarx.com (все прошедшие события) — кнопкой
// на /admin/imports, а не задачей расписания: суточная задача листает
// только свежее, а архив нужен один раз, и не с локальной машины (база
// на проде). Фоном, как пачка одобрения черновиков: одна карточка в
// журнале (kind «thaistarx-crawl»), прогресс и «Остановить» там же.

export async function startThaiStarXArchiveCrawl(): Promise<void> {
  await requireAdmin();
  // Один прогон за раз: второй параллельный ходил бы по тем же постам.
  const running = await prisma.importRun.findFirst({
    where: { kind: "thaistarx-crawl", finishedAt: null },
    select: { id: true },
  });
  if (running) {
    revalidatePath("/admin/imports");
    return;
  }
  void (async () => {
    const { runThaiStarXCrawl, summarizeThaiStarXCrawl } = await import("@/lib/thaiStarXCrawl");
    await logImportRun(
      "thaistarx-crawl",
      (runId) => runThaiStarXCrawl({ listing: "archive", runId }),
      summarizeThaiStarXCrawl,
    ).catch(() => {
      // Падение уже записано в журнал самим logImportRun.
    });
  })();
  revalidatePath("/admin/imports");
}
