import { prisma } from "@/lib/prisma";

// Реестр фоновых задач и их запуск по расписанию.
//
// Раньше интервалы были зашиты в instrumentation.ts: поменять час
// прогона можно было только деплоем, а выбрать, каких артистов проверять
// на новинки, было нельзя вовсе. Теперь расписание живёт в БД и
// правится на /admin/schedule.

export type JobDefinition = {
  key: string;
  title: string;
  description: string;
  /** Задача умеет работать по списку артистов (иначе — только «все»). */
  supportsTargets: boolean;
  /** `kind` в журнале ImportRun, куда задача пишет свои прогоны, —
   *  по нему вкладка задачи на /admin/schedule показывает историю. */
  logKind: string;
  /** Пишет ли задача спарсенные строки (ImportedItem) — тогда на её
   *  вкладке есть лента «что именно спарсено», а не только сводки. */
  logsItems: boolean;
  /** Раз в сколько дней запускать. Не задано — раз в сутки, как все
   *  задачи до появления недельного обхода маскотов ("gmmtv-mascots").
   *  Минимальная недельность: без «дня недели» — неделя отсчитывается
   *  от последнего прогона (см. isDue), в БД ничего не добавляется. */
  intervalDays?: number;
  run: (targetIds: string[] | null) => Promise<string>;
};

/**
 * Все известные задачи. Список в коде, а не в БД: запускать можно только
 * то, для чего есть реализация — иначе строка в таблице обещала бы
 * работу, которой нет.
 *
 * Досинки TMDB сюда пока не заводим: они тяжёлые, а каталог меняется
 * редко — их запускают руками с /admin/performers и /admin/dramas.
 */
export const JOB_DEFINITIONS: JobDefinition[] = [
  {
    key: "youtube-music",
    title: "YouTube Music: новинки",
    description:
      "Обходит артистов со ссылкой на канал и подтягивает новые релизы, песни и обложки. Появившееся попадает в «Что нового» на главной.",
    supportsTargets: true,
    // Тот же kind у ручного импорта дискографии из /admin/imports:
    // журнал общий, на вкладке задачи видны и ночные, и ручные прогоны.
    logKind: "youtube-music",
    logsItems: true,
    run: async (targetIds) => {
      const { refreshAllYoutubeMusic } = await import("@/lib/youtubeMusicImport");
      const { logImportRun } = await import("@/lib/importRun");
      // Через журнал импортов: ночной прогон раньше не оставлял следа в
      // /admin/imports, и понять, что именно он нашёл, было негде —
      // только итоговая строка в расписании.
      const summarize = (r: {
        checked: number;
        updated: number;
        failed: number;
        newTitles: string[];
      }) =>
        `проверено ${r.checked}, с новинками ${r.updated}, ошибок ${r.failed}` +
        (r.newTitles.length ? `: ${r.newTitles.slice(0, 5).join(", ")}` : "");

      const result = await logImportRun(
        "youtube-music",
        (runId) => refreshAllYoutubeMusic({ performerIds: targetIds, runId }),
        summarize,
      );
      // null — прогон остановили кнопкой в /admin/imports.
      return result ? summarize(result) : "остановлено вручную";
    },
  },
  {
    key: "mdl-auto-update",
    title: "MyDramaList: обновление сериалов",
    description:
      "Переоткрывает страницы сериалов с пометкой «обновлять по расписанию»: " +
      "у выходящих постоянно уточняются даты эфира, число серий, статус и оценка. " +
      "Заодно обновляется расписание серий (какая серия на какое число) — " +
      "у выходящего сериала даты следующих серий появляются неделя за неделей. " +
      "Пометку ставит вторая кнопка в импортах — и у одиночного сериала, и у импорта " +
      "со страницы поиска. За один прогон обходится до 300 карточек, начиная с тех, " +
      "которые дольше всех не открывали.",
    // Отбор идёт по флагу в карточке сериала, а список выбираемых
    // целей на /admin/schedule — про исполнителей.
    supportsTargets: false,
    logKind: "mdl-auto-update",
    // Прогон пишет только сводки: refreshMdlAutoUpdateDramas берёт runId
    // лишь для кнопки «Остановить», ImportedItem не создаёт.
    logsItems: false,
    run: async () => {
      const { refreshMdlAutoUpdateDramas } = await import("@/lib/mdlDramaImport");
      const { logImportRun } = await import("@/lib/importRun");
      const summarize = (r: {
        checked: number;
        updated: number;
        failed: number;
        scheduleChanged: number;
        episodesAdded: number;
        episodesChanged: number;
        pending: number;
        abortedAfter: string | null;
      }) =>
        `проверено ${r.checked}, с изменениями ${r.updated}, ошибок ${r.failed}` +
        (r.scheduleChanged
          ? `, расписание уточнилось у ${r.scheduleChanged} (серий +${r.episodesAdded}, дат ${r.episodesChanged})`
          : "") +
        (r.pending ? `, отложено до следующего прогона ${r.pending}` : "") +
        (r.abortedAfter ? ` · ${r.abortedAfter}` : "");

      const result = await logImportRun(
        "mdl-auto-update",
        (runId) => refreshMdlAutoUpdateDramas({ runId }),
        summarize,
      );
      // null — прогон остановили кнопкой в /admin/imports.
      return result ? summarize(result) : "остановлено вручную";
    },
  },
  {
    key: "mdl-new-searches",
    title: "MyDramaList: новинки по поискам",
    description:
      "Раз в день проверяет сохранённые ссылки на страницы поиска MDL (задаются ниже, " +
      "по строке на ссылку; в ссылке должна стоять сортировка «сначала новые» — so=newest). " +
      "Смотрит только верх выдачи: тайтлы, которых ещё нет в каталоге, импортируются " +
      "обычным путём с урезанным кастом и помечаются «обновлять по расписанию», а как " +
      "только встретился знакомый тайтл, обход этой ссылки заканчивается. Это не " +
      "переимпорт списка: уже известные сериалы не трогаются вовсе — их освежает " +
      "«MyDramaList: обновление сериалов».",
    supportsTargets: false,
    logKind: "mdl-new-searches",
    // Каждый заведённый тайтл — строка ImportedItem: на вкладке задачи
    // видно, какие новинки нашлись.
    logsItems: true,
    run: async () => {
      const { runMdlWatchSearches, summarizeMdlWatch } = await import("@/lib/mdlSearchImport");
      const { logImportRun } = await import("@/lib/importRun");
      const result = await logImportRun(
        "mdl-new-searches",
        (runId) => runMdlWatchSearches({ runId }),
        summarizeMdlWatch,
      );
      // null — прогон остановили кнопкой в /admin/imports.
      return result ? summarizeMdlWatch(result) : "остановлено вручную";
    },
  },
  {
    key: "doramaland-sync",
    title: "dorama.land: русские переводы",
    description:
      "Раз в день сверяет их каталог с нашим. Из sitemap dorama.land берутся только " +
      "незнакомые страницы сериалов (ещё не разобранные и не привязанные к нашим " +
      "записям) — до 300 за прогон, остаток дочитывается в следующие дни. Нашим сериалам " +
      "без русского названия дописываются перевод и варианты названий (сведение по " +
      "названию + году, однозначно); сериалы с переводом не трогаются, и на их страницы " +
      "никто не ходит. Их сериалы, которых у нас нет (Таиланд или яой/BL), сначала " +
      "ищутся на MDL и заводятся обычным импортом с пометкой «обновлять по расписанию», " +
      "потом получают перевод — до 40 MDL-поисков за прогон; не нашедшиеся на MDL " +
      "попадают в сводку, запись для них не создаётся.",
    // Отбор — их каталог целиком против нашего; артистов тут выбирать
    // нечего.
    supportsTargets: false,
    logKind: "doramaland-sync",
    // Каждый дописанный перевод и каждый заведённый сериал — строка
    // ImportedItem: на вкладке задачи видно, что именно нашлось.
    logsItems: true,
    run: async () => {
      const { runDoramaLandDaily, summarizeDoramaLandDaily } = await import("@/lib/doramalandSync");
      const { logImportRun } = await import("@/lib/importRun");
      const result = await logImportRun(
        "doramaland-sync",
        (runId) => runDoramaLandDaily({ runId }),
        summarizeDoramaLandDaily,
      );
      // null — прогон остановили кнопкой в /admin/imports.
      return result ? summarizeDoramaLandDaily(result) : "остановлено вручную";
    },
  },
  {
    key: "ttm-crawl",
    title: "ThaiTicketMajor: обход афиши",
    description:
      "Обходит афишу концертов и шоу на thaiticketmajor.com и ищет в составе каждого " +
      "события артистов из нашего каталога. Совпало — событие становится черновиком " +
      "в очереди на проверку (вкладка «События» в импортах): владелец одобряет или " +
      "отклоняет каждое, само в афишу ничего не попадает. События без совпадений " +
      "запоминаются и перепроверяются раз в неделю — артист мог появиться в каталоге " +
      "позже. За прогон скачивается до 40 страниц событий, с паузой между ними.",
    // Отбор — афиша целиком; выбирать артистов тут нечего: матчинг
    // и есть фильтр.
    supportsTargets: false,
    logKind: "ttm-crawl",
    // Каждый созданный черновик — строка ImportedItem: на вкладке
    // задачи видно, что именно нашлось, а не только сводки.
    logsItems: true,
    run: async () => {
      const { runTtmCrawl, summarizeTtmCrawl } = await import("@/lib/ttmCrawl");
      const { logImportRun } = await import("@/lib/importRun");
      const result = await logImportRun(
        "ttm-crawl",
        (runId) => runTtmCrawl({ runId }),
        summarizeTtmCrawl,
      );
      // null — прогон остановили кнопкой в /admin/imports.
      return result ? summarizeTtmCrawl(result) : "остановлено вручную";
    },
  },
  {
    key: "gmmtv-mascots",
    title: "GMMTV: маскоты с вики",
    description:
      "Раз в неделю проверяет страницу Mascots фан-вики GMMTV (официальный MediaWiki API). " +
      "Сначала сверяется ревизия страницы: ничего не менялось — прогон на этом и заканчивается. " +
      "Появились новые маскоты — каждый становится черновиком в очереди на проверку (вкладка " +
      "«Маскоты» в импортах) с совпавшими по имени владельцами из каталога: владелец одобряет " +
      "или отклоняет, само в каталог ничего не попадает. Маскоты, которые уже есть в каталоге " +
      "или уже были отклонены, повторно не предлагаются.",
    // Отбор — страница целиком; матчинг владельцев и есть фильтр.
    supportsTargets: false,
    logKind: "gmmtv-mascots",
    // Каждый созданный черновик — строка ImportedItem: на вкладке
    // задачи видно, что именно нашлось.
    logsItems: true,
    // Раз в неделю: страница меняется редко, а дешёвая проверка ревизии
    // всё равно отсекает пустые прогоны.
    intervalDays: 7,
    run: async () => {
      const { runGmmtvMascotsCrawl, summarizeGmmtvMascots } = await import("@/lib/gmmtvMascots");
      const { logImportRun } = await import("@/lib/importRun");
      const result = await logImportRun(
        "gmmtv-mascots",
        (runId) => runGmmtvMascotsCrawl({ runId }),
        summarizeGmmtvMascots,
      );
      // null — прогон остановили кнопкой в /admin/imports.
      return result ? summarizeGmmtvMascots(result) : "остановлено вручную";
    },
  },
  {
    key: "musicfestival-crawl",
    title: "musicfestival.in.th: фестивали",
    description:
      "Раз в день открывает список будущих фестивалей на musicfestival.in.th и заводит " +
      "события по новым адресам: название, даты (многодневные — одним событием), описание, " +
      "площадка, цены и ссылка на билеты, постер, ВЕСЬ лайнап. Артисты, которых нет в " +
      "каталоге, заводятся заготовками (одно имя и фото) — их список: Исполнители → фильтр " +
      "«Заготовки парсеров». Уже известные адреса не перечитываются — обходятся только новые, " +
      "до 20 фестивалей за прогон. Прошедшие фестивали заводятся разово скриптом.",
    supportsTargets: false,
    logKind: "musicfestival-crawl",
    // Каждое созданное событие и каждая заготовка — строка ImportedItem.
    logsItems: true,
    run: async () => {
      const { runMusicFestivalCrawl, summarizeMusicFestivalCrawl } = await import(
        "@/lib/musicFestivalCrawl"
      );
      const { logImportRun } = await import("@/lib/importRun");
      const result = await logImportRun(
        "musicfestival-crawl",
        (runId) => runMusicFestivalCrawl({ runId, listing: "upcoming" }),
        summarizeMusicFestivalCrawl,
      );
      // null — прогон остановили кнопкой в /admin/imports.
      return result ? summarizeMusicFestivalCrawl(result) : "остановлено вручную";
    },
  },
  {
    key: "cleanup-expired",
    title: "Чистка просроченного",
    description:
      "Удаляет из БД просроченные сессии и токены сброса пароля, а заодно ротирует журналы: " +
      "старый аудит, прочитанные уведомления, историю импортов, разобранные ошибки и " +
      "отработавшие дедуп-отметки телеграм-напоминаний. Без чистки всё это копилось бессрочно.",
    supportsTargets: false,
    logKind: "cleanup",
    // Чистка ничего не парсит — на её вкладке только карточки прогонов.
    logsItems: false,
    run: async () => {
      const { logImportRun } = await import("@/lib/importRun");
      // Через журнал импортов, как соседи: раньше от чистки оставалась
      // только строка «последний результат» в расписании — истории «что
      // и когда удалялось» не было вовсе. Своя свежая запись ротации не
      // мешает: строка журнала создаётся ДО удаления, а удаляется только
      // то, что старше IMPORT_LOG_RETENTION_DAYS.
      const summary = await logImportRun("cleanup", () => runCleanupExpired(), (s) => s);
      // null — «остановлено кнопкой»; у чистки нет точек остановки, но
      // контракт logImportRun общий.
      return summary ?? "остановлено вручную";
    },
  },
];

/** Тело чистки — вынесено из JOB_DEFINITIONS, чтобы обёртка журнала не
 *  раздувала сам список задач. Возвращает готовую сводку. */
async function runCleanupExpired(): Promise<string> {
  const now = new Date();
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const [sessions, tokens] = await Promise.all([
    prisma.userSession.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);

  // Журналы. ImportedItem чистим сами: связь с ImportRun — SetNull,
  // а не Cascade (см. schema.prisma), удаление прогона элементы не
  // уносит.
  const [audit, notifications, importedItems, importRuns, errors] = await Promise.all([
    prisma.auditLog.deleteMany({ where: { createdAt: { lt: daysAgo(AUDIT_LOG_RETENTION_DAYS) } } }),
    prisma.notification.deleteMany({
      where: { readAt: { not: null }, createdAt: { lt: daysAgo(READ_NOTIFICATION_RETENTION_DAYS) } },
    }),
    prisma.importedItem.deleteMany({ where: { createdAt: { lt: daysAgo(IMPORT_LOG_RETENTION_DAYS) } } }),
    prisma.importRun.deleteMany({ where: { startedAt: { lt: daysAgo(IMPORT_LOG_RETENTION_DAYS) } } }),
    prisma.errorLog.deleteMany({
      where: { reviewedAt: { not: null }, createdAt: { lt: daysAgo(REVIEWED_ERROR_RETENTION_DAYS) } },
    }),
  ]);

  // Дедуп-отметки напоминаний: нужны, только пока повод может
  // повториться (событие в ближайшие сутки, серия в окне добора,
  // день рождения в этом году) — дальше строки лишь занимают место.
  const [birthdays, episodes, eventReminders, presales] = await Promise.all([
    prisma.birthdayNotification.deleteMany({
      where: { createdAt: { lt: daysAgo(BIRTHDAY_DEDUPE_RETENTION_DAYS) } },
    }),
    prisma.episodeNotification.deleteMany({
      where: { createdAt: { lt: daysAgo(TELEGRAM_DEDUPE_RETENTION_DAYS) } },
    }),
    prisma.telegramNotification.deleteMany({
      where: { sentAt: { lt: daysAgo(TELEGRAM_DEDUPE_RETENTION_DAYS) } },
    }),
    prisma.telegramPresaleNotification.deleteMany({
      where: { sentAt: { lt: daysAgo(TELEGRAM_DEDUPE_RETENTION_DAYS) } },
    }),
  ]);

  const dedupe = birthdays.count + episodes.count + eventReminders.count + presales.count;
  return (
    `сессий удалено ${sessions.count}, токенов сброса ${tokens.count}, ` +
    `аудита ${audit.count}, уведомлений ${notifications.count}, ` +
    `импортов ${importRuns.count} (+элементов ${importedItems.count}), ` +
    `ошибок ${errors.count}, дедуп-отметок ${dedupe}`
  );
}

// Сроки хранения журналов (cleanup-expired). Числа — компромисс «есть к
// чему вернуться при разборе» против бессрочного роста таблиц.
/** Аудит правок каталога: полгода хватает, чтобы разобрать «кто это поменял». */
const AUDIT_LOG_RETENTION_DAYS = 180;
/** Прочитанные уведомления колокольчика; непрочитанные не трогаем. */
const READ_NOTIFICATION_RETENTION_DAYS = 90;
/** Журнал импортов (ImportRun + ImportedItem): старые прогоны уже не разбирают. */
const IMPORT_LOG_RETENTION_DAYS = 90;
/** Серверные ошибки с отметкой «разобрано»; неразобранные не трогаем. */
const REVIEWED_ERROR_RETENTION_DAYS = 90;
/** Дедуп поздравлений: ключ содержит год, прошлый год строке не нужен —
 *  но держим два, чтобы чистка заведомо не пересеклась с рабочим окном. */
const BIRTHDAY_DEDUPE_RETENTION_DAYS = 2 * 365;
/** Дедуп телеграм-напоминаний (серии, события, пресейлы): повод живёт
 *  сутки-дни, полгода — с большим запасом. */
const TELEGRAM_DEDUPE_RETENTION_DAYS = 180;

export function jobDefinition(key: string): JobDefinition | undefined {
  return JOB_DEFINITIONS.find((j) => j.key === key);
}

/** Строки расписания вместе с дефолтами для задач, которых ещё нет в БД. */
export async function listJobs() {
  const rows = await prisma.scheduledJob.findMany({
    include: {
      targets: {
        include: { performer: { select: { id: true, name: true, photoUrl: true } } },
      },
    },
  });
  const byKey = new Map(rows.map((r) => [r.key, r]));

  return JOB_DEFINITIONS.map((def) => {
    const row = byKey.get(def.key);
    return {
      ...def,
      enabled: row?.enabled ?? true,
      hour: row?.hour ?? 4,
      targetMode: row?.targetMode ?? ("ALL" as const),
      targets: row?.targets.map((t) => t.performer) ?? [],
      lastRunAt: row?.lastRunAt ?? null,
      lastStatus: row?.lastStatus ?? null,
      lastSummary: row?.lastSummary ?? null,
    };
  });
}

/**
 * Пора ли запускать: наступил нужный час и с последнего прогона прошло
 * не меньше intervalDays календарных дней (по умолчанию 1 — «сегодня ещё
 * не запускались», как и было). Сравнение по календарному дню в зоне
 * процесса (TZ=Europe/Moscow) — «раз в сутки в 4 утра» должно означать
 * местные 4 утра; Math.round гасит сдвиг перехода на летнее время.
 * Экспортирована ради юнит-теста недельного интервала.
 */
export function isDue(
  hour: number,
  lastRunAt: Date | null,
  now: Date,
  intervalDays = 1,
): boolean {
  if (now.getHours() < hour) return false;
  if (!lastRunAt) return true;
  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const daysSince = Math.round((dayStart(now) - dayStart(lastRunAt)) / (24 * 60 * 60 * 1000));
  return daysSince >= intervalDays;
}

/**
 * Захват задачи перед запуском. Атомарно: отметка ставится updateMany с
 * условием «lastRunAt всё ещё тот, что мы прочитали» — из двух
 * пересёкшихся тиков (или процессов) условие сойдётся только у одного.
 * Раньше здесь был безусловный upsert, и окно listJobs→upsert позволяло
 * запустить один job дважды.
 */
async function claimJob(key: string, hour: number, lastRunAt: Date | null, now: Date): Promise<boolean> {
  const claimed = await prisma.scheduledJob.updateMany({
    // lastRunAt: null в фильтре — это IS NULL: строка есть, но задача
    // ещё ни разу не запускалась.
    where: { key, lastRunAt },
    data: { lastRunAt: now, lastStatus: "RUNNING" },
  });
  if (claimed.count > 0) return true;
  if (lastRunAt !== null) return false; // отметку успел поставить другой тик

  // Строки может не быть вовсе (задача из кода ещё не сохранялась в БД)
  // — тогда захват и есть создание строки; гонку судит уникальный key.
  try {
    await prisma.scheduledJob.create({
      data: { key, hour, lastRunAt: now, lastStatus: "RUNNING" },
    });
    return true;
  } catch {
    return false;
  }
}

// Прогоны в этом процессе — строго по одному: тик может прийти, пока
// прошлый ещё работает (у instrumentation.ts свой guard, но runDueJobs
// зовут и вручную).
let runningTick = false;

/** Один тик планировщика: запускает всё, чему пришло время. */
export async function runDueJobs(now = new Date()): Promise<string[]> {
  if (runningTick) return [];
  runningTick = true;
  try {
    return await runDueJobsInner(now);
  } finally {
    runningTick = false;
  }
}

async function runDueJobsInner(now: Date): Promise<string[]> {
  const jobs = await listJobs();
  const started: string[] = [];

  for (const job of jobs) {
    if (!job.enabled || !isDue(job.hour, job.lastRunAt, now, job.intervalDays ?? 1)) continue;
    // Отметку ставим ДО запуска: прогон длинный, и при перезапуске
    // приложения задача не должна стартовать второй раз за сутки.
    if (!(await claimJob(job.key, job.hour, job.lastRunAt, now))) continue;
    started.push(job.key);

    const targetIds =
      job.supportsTargets && job.targetMode === "SELECTED"
        ? job.targets.map((t) => t.id)
        : null;

    try {
      const summary = await job.run(targetIds);
      await prisma.scheduledJob.update({
        where: { key: job.key },
        data: { lastStatus: "DONE", lastSummary: summary },
      });
    } catch (err) {
      await prisma.scheduledJob.update({
        where: { key: job.key },
        data: {
          lastStatus: "FAILED",
          lastSummary: err instanceof Error ? err.message : String(err),
        },
      });
      console.warn(`scheduled job ${job.key} failed:`, err);
    }
  }

  return started;
}
