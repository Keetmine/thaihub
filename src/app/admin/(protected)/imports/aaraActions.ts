"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { logImportRun } from "@/lib/importRun";

// Разовый обход АРХИВА a-ara.co.jp (всё прошедшее с 2024 года) —
// кнопкой на /admin/imports, а не задачей расписания: суточная задача
// листает только свежее, а архив нужен один раз. Фоном, как обход
// архива thaistarx: одна карточка в журнале (kind «aara-crawl»),
// прогресс и «Остановить» там же.
//
// Архивный прогон идёт по ОБОИМ разделам сайта: у промоутера событие
// переезжает из /event/ в /past_events/, когда пройдёт, и поймать его
// целиком можно только так.

export async function startAaraArchiveCrawl(): Promise<void> {
  await requireAdmin();
  // Один прогон за раз: второй параллельный ходил бы по тем же
  // страницам и удвоил бы нагрузку на чужой сайт.
  const running = await prisma.importRun.findFirst({
    where: { kind: "aara-crawl", finishedAt: null },
    select: { id: true },
  });
  if (running) {
    revalidatePath("/admin/imports");
    return;
  }
  void (async () => {
    const { runAaraCrawl, summarizeAaraCrawl } = await import("@/lib/aaraCrawl");
    await logImportRun(
      "aara-crawl",
      (runId) => runAaraCrawl({ listing: "archive", runId }),
      summarizeAaraCrawl,
    ).catch(() => {
      // Падение уже записано в журнал самим logImportRun.
    });
  })();
  revalidatePath("/admin/imports");
}
