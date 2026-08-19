"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCatalogEditor } from "@/lib/auth";
import { importTpopAgency, importTpopArtist } from "@/lib/tpopAgencyImport";

/** Импорт агентства с tpop.fandom.com из формы на /admin/imports.
 *  Долгий (минуты) — поэтому НЕ ждём завершения: создаём ImportRun со
 *  статусом RUNNING и уходим в фон, прогресс пишется в run.summary
 *  (страница импортов поллит и показывает живой статус). */
export async function runTpopAgencyImport(formData: FormData): Promise<void> {
  await requireCatalogEditor();
  const url = String(formData.get("url") ?? "").trim();
  if (!url) throw new Error("Укажите ссылку на страницу агентства");
  if (!/tpop\.fandom\.com/.test(url) && /\//.test(url)) {
    throw new Error("Ожидается ссылка вида https://tpop.fandom.com/wiki/…");
  }

  const run = await prisma.importRun.create({
    data: { kind: "tpop-agency", summary: "Запускается…" },
  });

  // Троттлим запись прогресса: каждое сообщение в БД — лишние сотни
  // апдейтов, раз в пару секунд достаточно.
  let lastWrite = 0;
  let lastMessage = "";
  const progress = (m: string) => {
    lastMessage = m;
    const now = Date.now();
    if (now - lastWrite < 2000) return;
    lastWrite = now;
    void prisma.importRun
      .update({ where: { id: run.id }, data: { summary: m.slice(0, 500) } })
      .catch(() => {});
  };

  void (async () => {
    try {
      const summary = await importTpopAgency(url, { runId: run.id, onProgress: progress });
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
      await prisma.importRun
        .update({
          where: { id: run.id },
          data: {
            status: "FAILED",
            finishedAt: new Date(),
            summary: `${lastMessage ? `${lastMessage} → ` : ""}${e instanceof Error ? e.message : "Неизвестная ошибка"}`.slice(0, 500),
          },
        })
        .catch(() => {});
    }
  })();

  revalidatePath("/admin/imports");
}

/** Одиночный импорт артиста/группы с tpop.fandom (та же фоновая схема
 *  с прогрессом в run.summary, что и у агентского импорта). */
export async function runTpopArtistImport(formData: FormData): Promise<void> {
  await requireCatalogEditor();
  const url = String(formData.get("url") ?? "").trim();
  if (!url) throw new Error("Укажите ссылку на страницу артиста");
  if (!/tpop\.fandom\.com/.test(url) && /\//.test(url)) {
    throw new Error("Ожидается ссылка вида https://tpop.fandom.com/wiki/…");
  }

  const run = await prisma.importRun.create({
    data: { kind: "tpop-artist", summary: "Запускается…" },
  });

  let lastWrite = 0;
  let lastMessage = "";
  const progress = (m: string) => {
    lastMessage = m;
    const now = Date.now();
    if (now - lastWrite < 2000) return;
    lastWrite = now;
    void prisma.importRun
      .update({ where: { id: run.id }, data: { summary: m.slice(0, 500) } })
      .catch(() => {});
  };

  void (async () => {
    try {
      const summary = await importTpopArtist(url, { runId: run.id, onProgress: progress });
      await prisma.importRun.update({
        where: { id: run.id },
        data: {
          status: "DONE",
          finishedAt: new Date(),
          summary:
            `${url.split("/wiki/")[1]?.replace(/_/g, " ") ?? url}: ` +
            `+${summary.performersCreated}/~${summary.performersUpdated}, ` +
            `альбомов ${summary.albumsTouched}, песен +${summary.songsCreated}, ` +
            `событий +${summary.eventsCreated}` +
            (summary.agencyName ? ` · ${summary.agencyName}` : ""),
        },
      });
    } catch (e) {
      await prisma.importRun
        .update({
          where: { id: run.id },
          data: {
            status: "FAILED",
            finishedAt: new Date(),
            summary: `${lastMessage ? `${lastMessage} → ` : ""}${e instanceof Error ? e.message : "Неизвестная ошибка"}`.slice(0, 500),
          },
        })
        .catch(() => {});
    }
  })();

  revalidatePath("/admin/imports");
}

/** Пометить упавшие импорты разобранными — гасит бейдж в сайдбаре. */
export async function markImportsReviewed(): Promise<void> {
  await requireCatalogEditor();
  await prisma.importRun.updateMany({
    where: { status: "FAILED", reviewedAt: null },
    data: { reviewedAt: new Date() },
  });
  revalidatePath("/admin/imports");
  revalidatePath("/admin");
}
