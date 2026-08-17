"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { importTpopAgency } from "@/lib/tpopAgencyImport";

/** Импорт агентства с tpop.fandom.com из формы на /admin/imports.
 *  Пишет ImportRun + каждый созданный/обновлённый объект в ImportedItem
 *  («последнее спарсенное»). Долгий: артисты обходятся последовательно. */
export async function runTpopAgencyImport(formData: FormData): Promise<void> {
  await requireAdmin();
  const url = String(formData.get("url") ?? "").trim();
  if (!url) throw new Error("Укажите ссылку на страницу агентства");
  if (!/tpop\.fandom\.com/.test(url) && /\//.test(url)) {
    throw new Error("Ожидается ссылка вида https://tpop.fandom.com/wiki/…");
  }

  const run = await prisma.importRun.create({ data: { kind: "tpop-agency" } });
  try {
    const summary = await importTpopAgency(url, { runId: run.id });
    await prisma.importRun.update({
      where: { id: run.id },
      data: {
        status: "DONE",
        finishedAt: new Date(),
        summary:
          `${summary.agencyName}: исполнителей +${summary.performersCreated}/~${summary.performersUpdated}, ` +
          `альбомов ${summary.albumsTouched}, песен +${summary.songsCreated}, ` +
          `событий +${summary.eventsCreated} (совпало ${summary.concertsMatched}` +
          (summary.concertsNotFound.length > 0
            ? `, не найдено ${summary.concertsNotFound.length}`
            : "") +
          ")",
      },
    });
  } catch (e) {
    await prisma.importRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        summary: e instanceof Error ? e.message : "Неизвестная ошибка",
      },
    });
    throw e;
  }
  revalidatePath("/admin/imports");
}
