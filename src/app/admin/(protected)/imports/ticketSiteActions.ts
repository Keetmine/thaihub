"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { logImportRun } from "@/lib/importRun";

// Разовый обход Ticketmelon ЦЕЛИКОМ (вся карта сайта, ~600 событий) —
// кнопкой на /admin/imports, фоном: суточная задача берёт по 60 страниц
// и добирала бы хвост десять дней. Один прогон за раз.

export async function startTicketmelonFullCrawl(): Promise<void> {
  await requireAdmin();
  const running = await prisma.importRun.findFirst({ where: { kind: "ticketmelon-crawl", finishedAt: null }, select: { id: true } });
  if (running) {
    revalidatePath("/admin/imports");
    return;
  }
  void (async () => {
    const { runTicketmelonCrawl, summarizeTicketSiteCrawl } = await import("@/lib/ticketSiteCrawl");
    await logImportRun("ticketmelon-crawl", (runId) => runTicketmelonCrawl({ runId, maxPages: 700 }), summarizeTicketSiteCrawl).catch(() => {
      // Падение уже записано в журнал самим logImportRun.
    });
  })();
  revalidatePath("/admin/imports");
}
