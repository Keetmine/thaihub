"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCatalogEditor } from "@/lib/auth";
import { importTpopArtist } from "@/lib/tpopAgencyImport";
import { importYtmForPerformer } from "@/lib/youtubeMusicImport";
import { logImportRun } from "@/lib/importRun";
import { parseChannelId } from "@/lib/youtubeMusic";
import { importMdlPerformer } from "@/lib/mdlPerformerImport";


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

/**
 * Импорт дискографии с YouTube Music. Ссылка на канал + исполнитель из
 * нашего каталога: сопоставлять по имени автоматически нельзя — «JASP.ER»
 * и «Jasper» для нас разные строки, а ошибка привяжет чужие альбомы.
 */
export async function runYoutubeMusicImport(formData: FormData): Promise<void> {
  await importYoutubeMusic(formData, false);
}

/** Та же кнопка, но артист заодно попадает в список проверяемых
 *  ежедневной задачей: разовый импорт даёт дискографию на сегодня, а
 *  дальше новые релизы нужно кем-то забирать — иначе про добавление в
 *  расписание вспоминают через месяц, увидев пустое «Что нового». */
export async function runYoutubeMusicImportAndSchedule(formData: FormData): Promise<void> {
  await importYoutubeMusic(formData, true);
}

async function importYoutubeMusic(formData: FormData, schedule: boolean): Promise<void> {
  await requireCatalogEditor();
  const performerId = String(formData.get("performerId") ?? "").trim();
  const rawUrl = String(formData.get("channelUrl") ?? "").trim();
  if (!performerId) throw new Error("Выберите исполнителя");
  const channelId = parseChannelId(rawUrl);
  if (!channelId) throw new Error("Не похоже на ссылку канала YouTube Music");

  if (schedule) {
    // Раньше импорта: если парсинг упадёт, артист всё равно останется в
    // расписании и ночной прогон повторит попытку сам.
    await prisma.scheduledJob.upsert({
      where: { key: "youtube-music" },
      create: { key: "youtube-music" },
      update: {},
    });
    await prisma.scheduledJobTarget.upsert({
      where: { jobKey_performerId: { jobKey: "youtube-music", performerId } },
      create: { jobKey: "youtube-music", performerId },
      update: {},
    });
    revalidatePath("/admin/schedule");
  }

  await logImportRun(
    "youtube-music",
    (runId) => importYtmForPerformer(performerId, channelId, undefined, runId),
    (r) =>
      `${r.performerName}: релизов +${r.albumsCreated} (обновлено ${r.albumsUpdated}), ` +
      `песен +${r.songsCreated} (обновлено ${r.songsUpdated})` +
      (r.linkAdded ? ", добавлена ссылка на канал" : ""),
  );

  revalidatePath("/admin/imports");
  revalidatePath(`/admin/performers/${performerId}/edit`);
}

/**
 * Импорт одного человека с MyDramaList. Пришёл на смену массовым
 * обходам TMDB: адрес страницы даёт человек, поэтому чужой профиль в
 * карточку не попадёт. Исполнитель необязателен — без него заводится
 * новый.
 */
export async function runMdlPerformerImport(formData: FormData): Promise<void> {
  await requireCatalogEditor();
  const url = String(formData.get("mdlUrl") ?? "").trim();
  const performerId = String(formData.get("performerId") ?? "").trim() || undefined;
  if (!url) throw new Error("Вставьте ссылку на профиль MyDramaList");

  const result = await logImportRun(
    "mdl-performer",
    (runId) => importMdlPerformer(url, performerId, runId),
    (r) =>
      `${r.name}: ${r.created ? "создан" : "обновлён"}` +
      (r.filled.length ? `, заполнено — ${r.filled.join(", ")}` : ", новых полей нет") +
      (r.linksAdded ? `, ссылок +${r.linksAdded}` : "") +
      (r.dramasLinked ? `, привязано сериалов ${r.dramasLinked}` : "") +
      (r.dramasSkipped ? ` (${r.dramasSkipped} нет в каталоге)` : ""),
  );

  revalidatePath("/admin/imports");
  revalidatePath(`/admin/performers/${result.performerId}/edit`);
}
