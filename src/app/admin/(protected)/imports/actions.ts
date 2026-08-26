"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCatalogEditor } from "@/lib/auth";
import { importTpopArtist } from "@/lib/tpopAgencyImport";
import { importYtmForPerformer } from "@/lib/youtubeMusicImport";
import { logImportRun, isImportCancelledError, checkImportCancelled } from "@/lib/importRun";
import { resolveChannelInput, parseChannelHandle } from "@/lib/youtubeMusic";
import { importMdlPerformer } from "@/lib/mdlPerformerImport";
import { mdlIdFromUrl, absMdlUrl, type MdlCastMember } from "@/lib/mydramalist";
import { upsertDramaFromMdl } from "@/lib/mdlDramaImport";
import { importMdlSearch, parseMdlSearchInput, summarizeMdlSearch } from "@/lib/mdlSearchImport";

/**
 * Пишет ход длинного прогона в `run.summary` — страница импортов
 * перечитывает его раз в 4 секунды, пока есть RUNNING.
 *
 * Не чаще раза в две секунды: на обходе в тысячу страниц апдейт на
 * каждый шаг — это тысяча лишних запросов в БД. И только пока прогон
 * идёт (`updateMany` со статусом): последняя запись прогресса может
 * уйти в БД уже после того, как logImportRun поставил итоговую
 * сводку, и без фильтра затёрла бы её обратно на «импортируем 998
 * из 1000».
 */
function progressWriter(runId: string): (message: string) => void {
  let lastWrite = 0;
  return (message: string) => {
    const now = Date.now();
    if (now - lastWrite < 2000) return;
    lastWrite = now;
    void prisma.importRun
      .updateMany({
        where: { id: runId, status: "RUNNING" },
        data: { summary: message.slice(0, 500) },
      })
      .catch(() => {});
  };
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
  // Ссылка бывает и с хендлом (music.youtube.com/@FREEZEDROP) — id
  // канала в ней не записан, его приходится доставать со страницы
  // канала; раньше такие ссылки просто отбивались ошибкой.
  const channelId = await resolveChannelInput(rawUrl);
  if (!channelId) {
    throw new Error(
      parseChannelHandle(rawUrl)
        ? "Не удалось определить канал по этой ссылке — попробуйте адрес вида /channel/UC…"
        : "Не похоже на ссылку канала YouTube Music",
    );
  }

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
  const withFilmography = formData.get("withFilmography") === "on";
  if (!url) throw new Error("Вставьте ссылку на профиль MyDramaList");

  // В фоне: с галочкой «разобрать фильмографию» прогон открывает до
  // 25 страниц сериалов, форма не должна этого ждать. Ход и кнопка
  // «Остановить» — в журнале импортов.
  void (async () => {
    await logImportRun(
      "mdl-performer",
      (runId) => importMdlPerformer(url, performerId, runId, { withFilmography }),
      (r) =>
        `${r.name}: ${r.created ? "создан" : "обновлён"}` +
        (r.filled.length ? `, заполнено — ${r.filled.join(", ")}` : ", новых полей нет") +
        (r.linksAdded ? `, ссылок +${r.linksAdded}` : "") +
        (r.dramasLinked ? `, привязано сериалов ${r.dramasLinked}` : "") +
        (r.dramasCreated ? `, заведено сериалов ${r.dramasCreated}` : "") +
        (r.dramasEnriched ? `, дозаполнено сериалов ${r.dramasEnriched}` : "") +
        (r.dramasFailed ? `, не открылось ${r.dramasFailed}` : "") +
        (r.dramasSkipped ? ` (${r.dramasSkipped} нет в каталоге)` : ""),
    ).catch(() => {
      // Падение уже записано в журнал самим logImportRun.
    });
  })();

  revalidatePath("/admin/imports");
  revalidatePath("/admin/performers");
  revalidatePath("/admin/dramas");
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
): Promise<{
  linked: number;
  createdPerformers: number;
  enriched: number;
  enrichFailed: number;
}> {
  let linked = 0;
  let createdPerformers = 0;
  let enriched = 0;
  let enrichFailed = 0;
  // Страховка от очень длинных кастов: каждая карточка — это отдельная
  // страница MDL, а она может открываться через браузер и занимать
  // десятки секунд.
  const ENRICH_LIMIT = 20;
  const staleBefore = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  for (const member of cast) {
    // Между актёрами даём остановить прогон: каст большой, ждать конца
    // ради отмены неразумно.
    await checkImportCancelled(runId);

    const mdlUrl = absMdlUrl(member.mdlPath);
    let performer = await prisma.performer.findFirst({
      where: {
        OR: [
          { mydramalistUrl: mdlUrl },
          { name: { equals: member.name, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        photoUrl: true,
        bio: true,
        realName: true,
        birthDate: true,
        mdlSyncedAt: true,
        _count: { select: { links: true } },
      },
    });
    let isNew = false;

    if (!performer) {
      const created = await prisma.performer.create({
        data: { name: member.name, mydramalistUrl: mdlUrl },
        select: { id: true },
      });
      performer = {
        id: created.id,
        photoUrl: null,
        bio: null,
        realName: null,
        birthDate: null,
        mdlSyncedAt: null,
        _count: { links: 0 },
      };
      isNew = true;
      createdPerformers += 1;
      await prisma.importedItem.create({
        data: {
          runId,
          entityType: "performer",
          entityId: created.id,
          action: "created",
          label: member.name,
        },
      });
    }

    // Дозаполняем карточку со страницы актёра — и заведённую только что,
    // и давнюю, если в ней чего-то не хватает. Полную и недавно
    // синхронизированную не трогаем: импорт всё равно пишет только в
    // пустые поля, а страница грузится долго.
    const incomplete =
      !performer.photoUrl ||
      !performer.bio ||
      !performer.realName ||
      !performer.birthDate ||
      performer._count.links === 0;
    const stale = !performer.mdlSyncedAt || performer.mdlSyncedAt < staleBefore;
    if ((isNew || (incomplete && stale)) && enriched + enrichFailed < ENRICH_LIMIT) {
      try {
        await importMdlPerformer(mdlUrl, performer.id, runId);
        await prisma.performer.update({
          where: { id: performer.id },
          data: { mdlSyncedAt: new Date() },
        });
        enriched += 1;
      } catch (e) {
        // Отмену пробрасываем, всё остальное — не повод ронять импорт
        // сериала: связь с актёром уже есть, карточку дозаполним позже.
        if (isImportCancelledError(e)) throw e;
        enrichFailed += 1;
      }
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

  return { linked, createdPerformers, enriched, enrichFailed };
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
  await importMdlDrama(formData, false);
}

/** Та же кнопка, но сериал заодно получает пометку «обновлять по
 *  расписанию» (`Drama.mdlAutoUpdate`): у выходящего тайтла даты эфира,
 *  число серий и статус меняются неделями, и без пометки за ними
 *  пришлось бы возвращаться руками. */
export async function runMdlDramaImportAndSchedule(formData: FormData): Promise<void> {
  await importMdlDrama(formData, true);
}

async function importMdlDrama(formData: FormData, autoUpdate: boolean): Promise<void> {
  await requireCatalogEditor();
  const url = String(formData.get("mdlUrl") ?? "").trim();
  if (!url) throw new Error("Вставьте ссылку на сериал MyDramaList");
  if (!mdlIdFromUrl(url)) {
    throw new Error("Не похоже на ссылку сериала MyDramaList");
  }

  // В фоне, как импорт с tpop: теперь прогон дозаполняет ещё и карточки
  // актёров, а это отдельная страница MDL на каждого — форма не должна
  // висеть всё это время. Ход виден в журнале, там же кнопка
  // «Остановить».
  void (async () => {
    await logImportRun(
      "mdl-drama",
      async (runId) => {
        // Карточку сериала пишет общий upsertDramaFromMdl — им же
        // пользуется импорт фильмографии актёра. Каст разбираем здесь:
        // в фильмографии он не нужен, иначе вышла бы цепочка через
        // актёров.
        const { id, title, created, filled, mdl } = await upsertDramaFromMdl(url, { autoUpdate });
        const cast = await linkMdlCast(id, mdl.cast, runId);
        return {
          title,
          id,
          created,
          filled,
          ...cast,
          castFound: mdl.cast.length,
          peopleLinks: mdl.peopleLinks,
        };
      },
      (r) =>
        (r.created
          ? `${r.title}: создан`
          : `${r.title}: ${r.filled.length ? `заполнено — ${r.filled.join(", ")}` : "новых полей нет"}`) +
        (r.linked ? `, каст +${r.linked}` : ", новых связей каста нет") +
        (r.createdPerformers ? ` (заведено актёров ${r.createdPerformers})` : "") +
        (r.enriched ? `, дозаполнено карточек ${r.enriched}` : "") +
        (r.enrichFailed ? `, не открылось ${r.enrichFailed}` : "") +
        // Диагностика на случай «каст не подтянулся»: видно, нашли ли мы
        // актёров на странице вообще и есть ли там ссылки на людей.
        (r.castFound === 0
          ? r.peopleLinks === 0
            ? " · на странице MDL каста не оказалось"
            : ` · на странице ${r.peopleLinks} ссылок на людей, но карточек актёров не распознали`
          : r.castFound === r.linked
            ? ""
            : ` (на странице ${r.castFound})`),
    ).catch(() => {
      // Падение уже записано в журнал самим logImportRun.
    });
  })();

  revalidatePath("/admin/imports");
  revalidatePath("/admin/dramas");
  revalidatePath("/admin/performers");
}

/**
 * Импорт всех сериалов со страницы поиска MyDramaList.
 *
 * Ссылку владелец собирает на самом MDL их же фильтрами (тег, статус,
 * страна) и вставляет целиком — так не приходится держать в админке
 * копию их справочника тегов, которая всё равно устареет.
 */
export async function runMdlSearchImport(formData: FormData): Promise<void> {
  await importFromMdlSearch(formData, false);
}

/** Та же кнопка, но каждый найденный сериал получает пометку
 *  «обновлять по расписанию»: список выходящего затем обходится ночью
 *  сам, и следить за датами эфира руками не нужно. */
export async function runMdlSearchImportAndSchedule(formData: FormData): Promise<void> {
  await importFromMdlSearch(formData, true);
}

async function importFromMdlSearch(formData: FormData, autoUpdate: boolean): Promise<void> {
  await requireCatalogEditor();
  // Проверяем ДО ухода в фон: про кривой адрес нужно узнать сразу от
  // формы, а не через минуту из упавшего прогона.
  const searchUrl = parseMdlSearchInput(String(formData.get("searchUrl") ?? ""));

  // В фоне: страниц бывает десяток, и на каждый найденный сериал — своя
  // страница MDL плюс каст. Ход виден в журнале, там же «Остановить».
  void (async () => {
    await logImportRun(
      "mdl-search",
      (runId) =>
        // Прогресс пишем в сводку прогона: страниц бывает десяток, и без
        // этого в журнале минутами висело бы просто «идёт».
        importMdlSearch(searchUrl, { runId, autoUpdate, onProgress: progressWriter(runId) }),
      summarizeMdlSearch,
    ).catch(() => {
      // Падение уже записано в журнал самим logImportRun.
    });
  })();

  revalidatePath("/admin/imports");
  revalidatePath("/admin/dramas");
  revalidatePath("/admin/performers");
}
