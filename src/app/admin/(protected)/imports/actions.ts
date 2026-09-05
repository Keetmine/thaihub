"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCatalogEditor } from "@/lib/auth";
import { importTpopArtist } from "@/lib/tpopAgencyImport";
import { importYtmForPerformer } from "@/lib/youtubeMusicImport";
import { logImportRun, isImportCancelledError } from "@/lib/importRun";
import { resolveChannelInput, parseChannelHandle } from "@/lib/youtubeMusic";
import { importMdlPerformer } from "@/lib/mdlPerformerImport";
import { mdlIdFromUrl } from "@/lib/mydramalist";
import { upsertDramaFromMdl, summarizeSchedule } from "@/lib/mdlDramaImport";
import { linkMdlCast } from "@/lib/mdlCastLink";
import { importMdlSearch, parseMdlSearchInput, summarizeMdlSearch } from "@/lib/mdlSearchImport";
import { OPEN_MDL_REQUEST_WHERE } from "@/lib/mdlDramaRequests";
import { importMdlRequestsBatch, summarizeMdlRequestsBatch } from "./mdlRequestsBatch";
// Прогресс длинных прогонов в run.summary — вынесен в свой модуль
// (progressWriter.ts): им же пользуется пачка одобрения черновиков
// событий, а экспортировать sync-функцию из "use server"-файла нельзя.
import { progressWriter } from "./progressWriter";


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
      // См. progressWriter: не уронить процесс, но и не промолчать.
      .catch(console.error);
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
        (r.linkConflicts
          ? `, сеть занята у ${r.linkConflicts} ссыл. (у артиста другой хендл — проверьте руками)`
          : "") +
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
  launchMdlDramaImport(url, autoUpdate);

  revalidatePath("/admin/imports");
  revalidatePath("/admin/dramas");
  revalidatePath("/admin/performers");
}

/** Сам фоновый прогон импорта сериала — общий для формы со ссылкой и
 *  кнопки «Импортировать» у заявки пользователя. */
function launchMdlDramaImport(url: string, autoUpdate: boolean): void {
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
        const { id, title, created, filled, mdl, schedule } = await upsertDramaFromMdl(url, {
          autoUpdate,
        });
        // Каст целиком и с дозаполнением карточек: ссылку вставили
        // руками ради одного сериала, лишними эти страницы не будут.
        const cast = await linkMdlCast(id, mdl.cast, { runId, scope: "all", enrich: true });
        return {
          title,
          id,
          created,
          filled,
          schedule,
          ...cast,
          castFound: mdl.cast.length,
          peopleLinks: mdl.peopleLinks,
        };
      },
      (r) =>
        (r.created
          ? `${r.title}: создан`
          : `${r.title}: ${r.filled.length ? `заполнено — ${r.filled.join(", ")}` : "новых полей нет"}`) +
        summarizeSchedule(r.schedule) +
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
}

/**
 * «Импортировать» у заявки пользователя (MdlDramaRequest): тот же
 * точечный импорт сериала по ссылке, что и в форме выше, — просто адрес
 * берётся из заявки. Резолвит заявку не экшен, а хук в
 * upsertDramaFromMdl: сериал появился с этой страницей — заявка
 * закрылась, просившим дописались статусы и ушли уведомления. Поэтому
 * заявка исчезает из списка после УСПЕШНОГО завершения фонового
 * прогона, а не по клику.
 */
export async function runMdlRequestImport(formData: FormData): Promise<void> {
  await requireCatalogEditor();
  const id = String(formData.get("requestId") ?? "");
  const request = await prisma.mdlDramaRequest.findUnique({
    where: { id },
    select: { mdlUrl: true, resolvedAt: true },
  });
  if (!request) throw new Error("Заявка не найдена");
  if (request.resolvedAt) throw new Error("Заявка уже закрыта");
  launchMdlDramaImport(request.mdlUrl, false);

  revalidatePath("/admin/imports");
  revalidatePath("/admin/dramas");
  revalidatePath("/admin/performers");
}

/** Общий запуск пачки заявок: ОДИН фоновый прогон с одной карточкой в
 *  журнале («Заявки: импорт сериалов»), сериалы идут последовательно с
 *  паузой (см. mdlRequestsBatch.ts) — а не N параллельных запусков.
 *  Прогресс и кнопка «Остановить» — в журнале, как у остальных. */
function launchMdlRequestsBatch(requests: { mdlUrl: string; title: string }[]): void {
  void (async () => {
    await logImportRun(
      "mdl-requests",
      (runId) =>
        importMdlRequestsBatch(requests, { runId, onProgress: progressWriter(runId) }),
      summarizeMdlRequestsBatch,
    ).catch(() => {
      // Падение уже записано в журнал самим logImportRun.
    });
  })();
}

/** Порядок пачки — как у списка на странице: самые просимые вперёд,
 *  чтобы при остановке на середине успелось самое нужное. */
const REQUEST_BATCH_ORDER = [
  { users: { _count: "desc" } },
  { createdAt: "asc" },
] as const;

/** «Импортировать выбранные» из bulk-панели заявок. Берём только ещё
 *  открытые: заявка могла резолвнуться или быть отклонённой, пока
 *  владелец собирал выделение. */
export async function importSelectedMdlRequests(ids: string[]): Promise<void> {
  await requireCatalogEditor();
  const requests = await prisma.mdlDramaRequest.findMany({
    where: { id: { in: ids }, ...OPEN_MDL_REQUEST_WHERE },
    orderBy: [...REQUEST_BATCH_ORDER],
    select: { mdlUrl: true, title: true },
  });
  if (requests.length === 0) throw new Error("Среди выбранных не осталось открытых заявок");
  launchMdlRequestsBatch(requests);

  revalidatePath("/admin/imports");
  revalidatePath("/admin/dramas");
  revalidatePath("/admin/performers");
}

/** «Импортировать все» — по всем открытым заявкам разом. Потолок тот
 *  же, что у списка на странице: сто за прогон; больше сотни — сигнал
 *  разобрать очередь по частям, а не держать MDL занятым часами. */
export async function importAllOpenMdlRequests(): Promise<void> {
  await requireCatalogEditor();
  const requests = await prisma.mdlDramaRequest.findMany({
    where: OPEN_MDL_REQUEST_WHERE,
    orderBy: [...REQUEST_BATCH_ORDER],
    select: { mdlUrl: true, title: true },
    take: 100,
  });
  if (requests.length === 0) throw new Error("Открытых заявок нет");
  launchMdlRequestsBatch(requests);

  revalidatePath("/admin/imports");
  revalidatePath("/admin/dramas");
  revalidatePath("/admin/performers");
}

/** «Отклонить выбранные» из bulk-панели: то же, что точечное
 *  «Отклонить», но одним updateMany — резолвнутые по дороге заявки
 *  фильтр молча пропускает. */
export async function rejectSelectedMdlRequests(ids: string[]): Promise<void> {
  await requireCatalogEditor();
  await prisma.mdlDramaRequest.updateMany({
    where: { id: { in: ids }, resolvedAt: null },
    data: { rejectedAt: new Date() },
  });
  revalidatePath("/admin/imports");
  revalidatePath("/admin");
}

/** «Отклонить» заявку: мусорная ссылка. Запись остаётся с rejectedAt —
 *  повторный импорт списка не воскресит её и не добавит юзеров; если
 *  сериал всё же появится в каталоге, хук резолва её закроет и
 *  просившие узнают. */
export async function rejectMdlRequest(formData: FormData): Promise<void> {
  await requireCatalogEditor();
  const id = String(formData.get("requestId") ?? "");
  await prisma.mdlDramaRequest.updateMany({
    // updateMany, а не update: заявка могла резолвнуться, пока владелец
    // смотрел на список, — тогда молча ничего не делаем.
    where: { id, resolvedAt: null },
    data: { rejectedAt: new Date() },
  });
  revalidatePath("/admin/imports");
  revalidatePath("/admin");
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

/**
 * dorama.land: подтянуть русский перевод для ОДНОГО сериала по ссылке.
 *
 * Синхронно, без журнала импортов: это один запрос к одной странице.
 * Наша запись ищется по названию+году (как в массовом прогоне
 * scripts/doramaland-sync.ts); результат уезжает в адрес и рисуется
 * над карточкой — сообщение переживает redirect, состояния у формы нет.
 */
export async function importDoramaLandTranslation(formData: FormData): Promise<void> {
  await requireCatalogEditor();
  const url = String(formData.get("doramalandUrl") ?? "").trim();
  const back = (message: string): never =>
    redirect(`/admin/imports?dl=${encodeURIComponent(message)}`);

  if (!/^https:\/\/dorama\.land\//.test(url)) {
    back("Нужна ссылка вида https://dorama.land/…");
  }

  const { fetchDoramaLandPage, doramaLandMatchTitles, mergeTitleVariants } = await import(
    "@/lib/doramaland"
  );
  let page;
  try {
    page = await fetchDoramaLandPage(url);
  } catch (e) {
    back(`Страница не прочиталась: ${e instanceof Error ? e.message : e}`);
    return;
  }

  const titles = doramaLandMatchTitles(page);
  const thaiOriginal = page.original && /[฀-๿]/.test(page.original) ? page.original : null;
  const candidates = await prisma.drama.findMany({
    where: {
      OR: [
        ...titles.flatMap((title) => [
          { title: { equals: title, mode: "insensitive" as const } },
          { alsoKnownAs: { contains: title, mode: "insensitive" as const } },
        ]),
        ...(thaiOriginal ? [{ nativeTitle: thaiOriginal }] : []),
      ],
      ...(page.year ? { year: { gte: page.year - 1, lte: page.year + 1 } } : {}),
    },
    select: {
      id: true, slug: true, title: true, nativeTitle: true,
      alsoKnownAs: true, titleRu: true, synopsisRu: true,
    },
    take: 2,
  });
  if (candidates.length !== 1) {
    back(
      candidates.length === 0
        ? `Не нашли сериал в каталоге (искали: ${titles.join(", ") || page.original || "—"}${page.year ? `, ${page.year}` : ""}). Проверьте название и год.`
        : "Нашлось несколько кандидатов — сведение неоднозначно, обновите руками.",
    );
  }
  const drama = candidates[0];

  // Разовый импорт по ссылке — осознанное действие: переписываем и уже
  // заполненные русские поля (в массовом прогоне так делает --overwrite).
  await prisma.drama.update({
    where: { id: drama.id },
    data: {
      titleRu: page.titleRu ?? drama.titleRu,
      synopsisRu: page.descriptionRu ?? drama.synopsisRu,
      doramalandUrl: page.sourceUrl,
      alsoKnownAs: mergeTitleVariants(
        drama.alsoKnownAs,
        [
          ...(page.titleRu ? [page.titleRu] : []),
          ...page.altTitles,
          ...(page.original ? [page.original] : []),
        ],
        [drama.title, drama.nativeTitle, page.titleRu],
      ),
    },
  });
  revalidatePath(`/dramas/${drama.slug ?? drama.id}`);
  revalidatePath("/admin/dramas");
  back(`Готово: «${page.titleRu ?? page.sourceUrl}» → ${drama.title} (${drama.slug ?? drama.id}).`);
}