"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCatalogEditor } from "@/lib/auth";
import { importTpopArtist } from "@/lib/tpopAgencyImport";
import { importYtmForPerformer } from "@/lib/youtubeMusicImport";
import { logImportRun, isImportCancelledError } from "@/lib/importRun";
import { parseChannelId } from "@/lib/youtubeMusic";
import { importMdlPerformer } from "@/lib/mdlPerformerImport";
import { fetchMdlDrama, mdlIdFromUrl, absMdlUrl, type MdlCastMember } from "@/lib/mydramalist";
import { downloadRemoteImage } from "@/lib/localImage";


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
      // Этот импорт ведёт журнал сам, мимо logImportRun, — значит и
      // отмену должен отличать от падения сам, иначе остановленный
      // вручную прогон висел бы как «ошибка».
      const cancelled = isImportCancelledError(e);
      await prisma.importRun
        .update({
          where: { id: run.id },
          data: {
            status: cancelled ? "CANCELLED" : "FAILED",
            finishedAt: new Date(),
            summary: cancelled
              ? `${lastMessage ? `${lastMessage} → ` : ""}Остановлено вручную`.slice(0, 500)
              : `${lastMessage ? `${lastMessage} → ` : ""}${e instanceof Error ? e.message : "Неизвестная ошибка"}`.slice(0, 500),
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
  // null — импорт остановили кнопкой; страницу артиста ревалидировать
  // тогда нечего.
  if (result) revalidatePath(`/admin/performers/${result.performerId}/edit`);
}

/**
 * Привязка каста со страницы сериала. Актёра ищем сначала по ссылке на
 * MDL (точное совпадение), потом по имени; если не нашли — заводим
 * карточку-заготовку с именем и ссылкой. Заготовку потом дозаполнит
 * обычный импорт актёра — а так каст сериала оставался бы пустым, ради
 * чего всё и затевалось. Роли не перезаписываем: связь уже есть —
 * пропускаем.
 */
async function linkMdlCast(
  dramaId: string,
  cast: MdlCastMember[],
  runId: string,
): Promise<{ linked: number; createdPerformers: number }> {
  let linked = 0;
  let createdPerformers = 0;

  for (const member of cast) {
    const mdlUrl = absMdlUrl(member.mdlPath);
    let performer = await prisma.performer.findFirst({
      where: {
        OR: [
          { mydramalistUrl: mdlUrl },
          { name: { equals: member.name, mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });

    if (!performer) {
      performer = await prisma.performer.create({
        data: { name: member.name, mydramalistUrl: mdlUrl },
        select: { id: true },
      });
      createdPerformers += 1;
      await prisma.importedItem.create({
        data: {
          runId,
          entityType: "performer",
          entityId: performer.id,
          action: "created",
          label: member.name,
        },
      });
    }

    const already = await prisma.performerDrama.findUnique({
      where: { performerId_dramaId: { performerId: performer.id, dramaId } },
      select: { dramaId: true },
    });
    if (already) continue;

    await prisma.performerDrama.create({
      data: { performerId: performer.id, dramaId, role: member.role },
    });
    linked += 1;
  }

  return { linked, createdPerformers };
}

/**
 * Импорт ОДНОГО сериала со страницы MyDramaList по ссылке. В отличие от
 * кнопки на карточке сериала (она только дозаполняет уже существующую
 * запись), здесь сериала в каталоге может ещё не быть — тогда он
 * создаётся. Если сериал с такой же ссылкой уже есть, заполняем только
 * пустые поля: занесённое руками не переписываем. Статус — исключение,
 * он выводится из дат эфира и всегда освежается.
 */
export async function runMdlDramaImport(formData: FormData): Promise<void> {
  await requireCatalogEditor();
  const url = String(formData.get("mdlUrl") ?? "").trim();
  if (!url) throw new Error("Вставьте ссылку на сериал MyDramaList");
  if (!mdlIdFromUrl(url)) {
    throw new Error("Не похоже на ссылку сериала MyDramaList");
  }

  await logImportRun(
    "mdl-drama",
    async (runId) => {
      const mdl = await fetchMdlDrama(url);
      const existing = await prisma.drama.findFirst({
        where: { OR: [{ mydramalistUrl: url }, { title: mdl.title }] },
      });

      const poster = mdl.posterUrl ? await downloadRemoteImage(mdl.posterUrl, "mdl") : null;
      const base = {
        mydramalistUrl: url,
        nativeTitle: mdl.nativeTitle,
        alsoKnownAs: mdl.alsoKnownAs,
        synopsis: mdl.synopsis,
        posterUrl: poster,
        genres: mdl.genres,
        director: mdl.director,
        screenwriter: mdl.screenwriter,
        network: mdl.network,
        episodes: mdl.episodes,
        airedFrom: mdl.airedFrom,
        airedTo: mdl.airedTo,
        airedOn: mdl.airedOn,
        duration: mdl.duration,
        contentRating: mdl.contentRating,
        year: mdl.year,
        status: mdl.status,
        mdlScore: mdl.rating,
        mdlSyncedAt: new Date(),
      };

      if (!existing) {
        const created = await prisma.drama.create({
          data: { title: mdl.title, ...base },
        });
        const cast = await linkMdlCast(created.id, mdl.cast, runId);
        return {
          title: created.title,
          id: created.id,
          created: true,
          filled: [] as string[],
          ...cast,
        };
      }

      // Пустые поля дозаполняем, занятые оставляем как есть.
      const data: Record<string, unknown> = {
        mydramalistUrl: url,
        mdlScore: mdl.rating,
        mdlSyncedAt: new Date(),
      };
      const filled: string[] = [];
      const fill = (key: keyof typeof base, label: string) => {
        const current = (existing as unknown as Record<string, unknown>)[key];
        const next = base[key];
        const isEmpty =
          current === null || current === undefined || (Array.isArray(current) && current.length === 0);
        if (isEmpty && next !== null && next !== undefined) {
          data[key] = next;
          filled.push(label);
        }
      };
      fill("nativeTitle", "оригинальное название");
      fill("alsoKnownAs", "другие названия");
      fill("synopsis", "описание");
      fill("posterUrl", "постер");
      fill("genres", "жанры");
      fill("director", "режиссёр");
      fill("screenwriter", "сценарист");
      fill("network", "канал");
      fill("episodes", "серии");
      fill("airedFrom", "начало эфира");
      fill("airedTo", "конец эфира");
      fill("airedOn", "день выхода");
      fill("duration", "длительность");
      fill("contentRating", "возрастной рейтинг");
      fill("year", "год");
      // Статус выводится из дат эфира — освежаем всегда.
      if (mdl.status && mdl.status !== existing.status) {
        data.status = mdl.status;
        filled.push("статус");
      }

      const updated = await prisma.drama.update({ where: { id: existing.id }, data });
      const cast = await linkMdlCast(updated.id, mdl.cast, runId);
      return { title: updated.title, id: updated.id, created: false, filled, ...cast };
    },
    (r) =>
      (r.created
        ? `${r.title}: создан`
        : `${r.title}: ${r.filled.length ? `заполнено — ${r.filled.join(", ")}` : "новых полей нет"}`) +
      (r.linked ? `, каст +${r.linked}` : ", новых связей каста нет") +
      (r.createdPerformers ? ` (заведено актёров ${r.createdPerformers})` : ""),
  );

  revalidatePath("/admin/imports");
  revalidatePath("/admin/dramas");
  revalidatePath("/admin/performers");
}
