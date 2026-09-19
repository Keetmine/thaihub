import { prisma } from "@/lib/prisma";

// Реестр фоновых задач и их запуск по расписанию.
//
// Раньше интервалы были зашиты в instrumentation.ts: поменять час
// прогона можно было только деплоем, а выбрать, каких артистов проверять
// на новинки, было нельзя вовсе. Теперь расписание живёт в БД и
// правится на /admin/schedule.

/** Группы задач — ими размечены ряды вкладок на /admin/schedule и списки
 *  «Обходы по расписанию» на /admin/imports (правка владельца 2026-09-18:
 *  «сгруппировать, где кто что — сейчас каша»). Порядок — порядок на
 *  странице. */
export const JOB_GROUPS = [
  { key: "series", label: "Сериалы и актёры" },
  { key: "music", label: "Музыка" },
  { key: "events", label: "Афиша событий" },
  { key: "mascots", label: "Маскоты" },
  { key: "digests", label: "Рассылки" },
  { key: "service", label: "Служебное" },
] as const;
export type JobGroup = (typeof JOB_GROUPS)[number]["key"];

/**
 * Что задача вернула планировщику. Строка — «сделала всё, сводка вот»
 * (так возвращают почти все). Объект с `resumeInMinutes` — «взяла
 * пачку, осталось ещё; разбуди меня через столько-то минут», и тогда
 * планировщик запустит её ВНЕ суточного правила (правка владельца
 * 2026-09-18: «пока не будут спарсены все»).
 */
export type JobRunOutcome = { summary: string; resumeInMinutes?: number };

export function jobOutcome(result: string | JobRunOutcome): JobRunOutcome {
  return typeof result === "string" ? { summary: result } : result;
}

/** Сколько пачек задача уже отработала с начала суток — потолок на
 *  продолжение (см. mdl-auto-update ниже). Считаем по журналу прогонов:
 *  своей колонки под счётчик заводить незачем. */
async function countRunsSinceDayStart(kind: string): Promise<number> {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return prisma.importRun.count({ where: { kind, startedAt: { gte: dayStart } } });
}

/** Потолок пачек обновления MDL за сутки: 585 помеченных карточек — это
 *  две пачки по 300, шесть с запасом покрывают рост каталога. */
const MDL_MAX_BATCHES_PER_DAY = 6;

export type JobDefinition = {
  key: string;
  /** Группа на страницах расписания и импортов (см. JOB_GROUPS). */
  group: JobGroup;
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
  /** День недели, в который задача обязана идти (0 — воскресенье).
   *  Нужен рассылкам, у которых день — часть обещания: «дайджест по
   *  воскресеньям» должен приходить в воскресенье, а не через семь дней
   *  после прошлого прогона — один пропуск (задачу выключали, прогон
   *  упал) увёл бы рассылку на среду навсегда. В БД ничего не
   *  добавляется, как и у intervalDays. */
  weekday?: number;
  /** Час прогона у новой задачи, пока его не поменяли на
   *  /admin/schedule. Не задан — общие 4 утра: ночь удобна парсерам, но
   *  не рассылке, которую человек читает. */
  defaultHour?: number;
  run: (targetIds: string[] | null) => Promise<string | JobRunOutcome>;
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
    group: "music",
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
    group: "series",
    title: "MyDramaList: обновление сериалов",
    description:
      "Переоткрывает страницы сериалов с пометкой «обновлять по расписанию»: " +
      "у выходящих постоянно уточняются даты эфира, число серий, статус и оценка. " +
      "Заодно обновляется расписание серий (какая серия на какое число) — " +
      "у выходящего сериала даты следующих серий появляются неделя за неделей. " +
      "Пометку ставит вторая кнопка в импортах — и у одиночного сериала, и у импорта " +
      "со страницы поиска. Обход идёт ПАЧКАМИ по 300 карточек, начиная с тех, которые " +
      "дольше всех не открывали: осталось необойдённое — планировщик берёт следующую " +
      "пачку через десять минут, и так пока круг не пройден целиком (до шести пачек за " +
      "сутки). Прерванная деплоем задача продолжается через пару минут после запуска, " +
      "а не ждёт следующего дня.",
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
        remaining: number;
        abortedAfter: string | null;
      }) =>
        `проверено ${r.checked}, с изменениями ${r.updated}, ошибок ${r.failed}` +
        (r.scheduleChanged
          ? `, расписание уточнилось у ${r.scheduleChanged} (серий +${r.episodesAdded}, дат ${r.episodesChanged})`
          : "") +
        (r.remaining ? `, осталось обойти ${r.remaining} — продолжим следующей пачкой` : ", круг пройден целиком") +
        (r.abortedAfter ? ` · ${r.abortedAfter}` : "");

      const result = await logImportRun(
        "mdl-auto-update",
        (runId) => refreshMdlAutoUpdateDramas({ runId }),
        summarize,
      );
      // null — прогон остановили кнопкой в /admin/imports.
      if (!result) return "остановлено вручную";

      // Осталось необойдённое — просим планировщик продолжить, он
      // тикает раз в десять минут (правка владельца 2026-09-18: «потом
      // через таймер следующий прогон, и так пока не будут спарсены
      // все»). Потолок пачек за сутки — чтобы вечно падающая карточка,
      // которая всегда первая в очереди и всегда роняет свой запрос, не
      // гоняла задачу по кругу до утра; MDL закрылся проверкой
      // (abortedAfter) — тоже ждём завтрашнего дня.
      const batchesToday = await countRunsSinceDayStart("mdl-auto-update");
      const keepGoing =
        result.remaining > 0 && !result.abortedAfter && batchesToday < MDL_MAX_BATCHES_PER_DAY;
      return {
        summary:
          summarize(result) +
          (result.remaining > 0 && !keepGoing ? " · пачек за сутки хватит, остальное завтра" : ""),
        resumeInMinutes: keepGoing ? 1 : undefined,
      };
    },
  },
  {
    key: "mdl-new-searches",
    group: "series",
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
    group: "series",
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
    key: "asiapoisk-sync",
    group: "series",
    title: "asiapoisk: русские названия и страны",
    description:
      "Раз в день сверяет их каталог с нашим и дописывает то, чего у нас нет: русское " +
      "название и страну. Список карточек берётся из карты сайта (постраничная листалка " +
      "закрыта их robots.txt), а сведение идёт ПО АДРЕСАМ — в их слаге лежит английское " +
      "название, и открывать страницу ради сравнения не нужно. Читаются только совпавшие, " +
      "до 200 за прогон, с паузой 2 секунды, как просит сайт. Каждое совпадение " +
      "проверяется по стране и году из заголовка карточки: не сошлось — пропускаем, " +
      "иначе тайскому сериалу досталось бы название корейского ремейка. Пишем только " +
      "пустое: проставленные руками название и страна не трогаются.",
    supportsTargets: false,
    logKind: "asiapoisk-sync",
    logsItems: true,
    run: async () => {
      const { runAsiapoiskSync, summarizeAsiapoiskSync } = await import("@/lib/asiapoiskSync");
      const { logImportRun } = await import("@/lib/importRun");
      const result = await logImportRun(
        "asiapoisk-sync",
        (runId) => runAsiapoiskSync({ runId }),
        summarizeAsiapoiskSync,
      );
      return result ? summarizeAsiapoiskSync(result) : "остановлено вручную";
    },
  },
  {
    key: "blscene-locations",
    group: "series",
    title: "blscene: новые места съёмок",
    description:
      "Раз в день обходит страницы сериалов на blscene.com и подтягивает места съёмок, " +
      "появившиеся там с прошлой проверки. Сериалы ищутся и по сохранённой ссылке, и по " +
      "названию — второе важно для сериалов, заведённых другим импортом: у них ссылки нет, " +
      "и раньше их страницы не открывались вовсе. Новые места заводятся сразу в каталог " +
      "(очереди на проверку тут нет — источник свой, проверенный), уже связанные не " +
      "трогаются. Прогон открывает страницу каждого сериала, поэтому идёт несколько минут; " +
      "найденное попадает в ленту «Что нового» на главной.",
    supportsTargets: false,
    // Тот же kind, что у ручной кнопки «проверить новые локации» на
    // /admin/locations: журнал общий, на вкладке задачи видны и ночные
    // прогоны, и ручные.
    logKind: "blscene",
    // Прогон пишет только сводки: refreshBlsceneLocations берёт runId
    // ради кнопки «Остановить», ImportedItem не создаёт.
    logsItems: false,
    run: async () => {
      const { chromium } = await import("playwright");
      const { refreshBlsceneLocations } = await import("@/lib/blsceneImport");
      const { logImportRun } = await import("@/lib/importRun");
      const summarize = (r: {
        checked: number;
        refreshed: { title: string; newLocations: number }[];
        errors: { title: string; message: string }[];
      }) =>
        `проверено ${r.checked}` +
        (r.refreshed.length
          ? `, новые локации у ${r.refreshed.length}: ${r.refreshed
              .slice(0, 5)
              .map((d) => `${d.title} +${d.newLocations}`)
              .join(", ")}`
          : ", новых локаций нет") +
        (r.errors.length ? `, ошибок ${r.errors.length}` : "");

      // Координаты мест снимаются с гугл-карт настоящим браузером —
      // один на весь прогон, как у ручной кнопки.
      const browser = await chromium.launch();
      try {
        const result = await logImportRun(
          "blscene",
          (runId) => refreshBlsceneLocations(browser, undefined, runId),
          summarize,
        );
        // null — прогон остановили кнопкой в /admin/imports.
        return result ? summarize(result) : "остановлено вручную";
      } finally {
        await browser.close();
      }
    },
  },
  {
    key: "ttm-crawl",
    group: "events",
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
    key: "thaistarx-crawl",
    group: "events",
    title: "ThaiStarX: фан-события по миру",
    description:
      "Обходит трекер thaistarx.com — фанмиты, концерты, фанконы и премьеры тайских " +
      "артистов по всему миру — и кладёт новые события черновиками в очередь на " +
      "проверку (вкладка «События» в импортах): состав из тегов поста, а если есть " +
      "ссылка на ThaiTicketMajor — время, цены и состав дочитываются оттуда. Само в " +
      "афишу ничего не попадает. Листает список с первой страницы и останавливается, " +
      "где всё уже знакомо; события без совпадений перепроверяются раз в неделю. " +
      "Архив (все прошедшие) забирается разово кнопкой на странице импортов.",
    supportsTargets: false,
    logKind: "thaistarx-crawl",
    logsItems: true,
    run: async () => {
      const { runThaiStarXCrawl, summarizeThaiStarXCrawl } = await import("@/lib/thaiStarXCrawl");
      const { logImportRun } = await import("@/lib/importRun");
      const result = await logImportRun(
        "thaistarx-crawl",
        (runId) => runThaiStarXCrawl({ listing: "recent", runId }),
        summarizeThaiStarXCrawl,
      );
      return result ? summarizeThaiStarXCrawl(result) : "остановлено вручную";
    },
  },
  {
    key: "ticketmelon-crawl",
    group: "events",
    title: "Ticketmelon: обход афиши",
    description:
      "Обходит карту сайта ticketmelon.com (по 60 новых страниц за прогон, с паузами) и " +
      "ищет артистов каталога в названии и описании события — состав там не размечен. " +
      "Нашёлся — черновик в очереди на проверку (вкладка «События» в импортах); прошедшие " +
      "события запоминаются и больше не предлагаются; без совпадений — перепроверка раз в " +
      "неделю. Вся карта сайта разово — кнопкой на странице импортов.",
    supportsTargets: false,
    logKind: "ticketmelon-crawl",
    logsItems: true,
    run: async () => {
      const { runTicketmelonCrawl, summarizeTicketSiteCrawl } = await import("@/lib/ticketSiteCrawl");
      const { logImportRun } = await import("@/lib/importRun");
      const result = await logImportRun("ticketmelon-crawl", (runId) => runTicketmelonCrawl({ runId }), summarizeTicketSiteCrawl);
      return result ? summarizeTicketSiteCrawl(result) : "остановлено вручную";
    },
  },
  {
    key: "allticket-crawl",
    group: "events",
    title: "AllTicket: обход афиши",
    description:
      "Открывает концертный раздел allticket.com настоящим браузером (их список за " +
      "JS-проверкой AWS WAF) и ищет артистов каталога в названии и описании события. " +
      "ВАЖНО: с адреса нашего сервера этот список закрыт — API отвечает 403 и браузеру " +
      "тоже (проверено 19.09.2026), так что задача честно заканчивается с пометкой, а не " +
      "падает. События AllTicket всё равно доезжают: «событие по ссылке» с их страницы " +
      "работает, и на них ссылаются посты ThaiStarX и фестивали musicfestival.in.th. " +
      "Задачу имеет смысл держать выключенной, пока список не откроется.",
    supportsTargets: false,
    logKind: "allticket-crawl",
    logsItems: true,
    run: async () => {
      const { runAllticketCrawl, summarizeTicketSiteCrawl } = await import("@/lib/ticketSiteCrawl");
      const { logImportRun } = await import("@/lib/importRun");
      const result = await logImportRun("allticket-crawl", (runId) => runAllticketCrawl({ runId }), summarizeTicketSiteCrawl);
      return result ? summarizeTicketSiteCrawl(result) : "остановлено вручную";
    },
  },
  {
    key: "gmmtv-mascots",
    group: "mascots",
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
    group: "events",
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
    key: "weekly-digest",
    group: "digests",
    title: "Недельный дайджест подписчикам",
    description:
      "По воскресеньям утром рассылает подписчикам «Вашу неделю» в Telegram: серии " +
      "отмеченных сериалов, события, на которые человек идёт или которые в избранном, " +
      "старты продаж по ним и дни рождения избранных артистов — на семь дней вперёд. " +
      "Получают только те, у кого привязан Telegram, активна подписка и включён " +
      "переключатель «Недельный дайджест» в настройках. Кому за неделю ничего не " +
      "набралось, письмо НЕ уходит: «у вас ничего нет» — это спам, а не забота. " +
      "Подборку собирает тот же код, что отвечает боту на /week.",
    supportsTargets: false,
    // Журнала прогонов у рассылки нет (в отличие от парсеров): ImportRun —
    // про импорты, и любая незакрытая строка в нём блокирует кнопки в
    // /admin/imports. Итог прогона виден в самом расписании — строкой
    // «последний результат».
    logKind: "weekly-digest",
    logsItems: false,
    intervalDays: 7,
    // Воскресенье — часть обещания в подписи переключателя, поэтому день
    // жёсткий, а не «через семь дней после прошлого раза» (см. isDue).
    weekday: 0,
    // Не 4 утра, как у парсеров: дайджест человек читает, а не сервер.
    defaultHour: 10,
    run: async () => {
      const { sendWeeklyDigests } = await import("@/lib/telegramNotifications");
      const sent = await sendWeeklyDigests();
      return `отправлено ${sent}`;
    },
  },
  {
    key: "community-digest",
    group: "digests",
    title: "Месячная сводка владельцам сообществ",
    description:
      "Раз в месяц пишет создателю каждого сообщества в Telegram, что у него за 30 дней " +
      "произошло: сколько пришло участников, сколько завели тем и написали комментариев, " +
      "какая встреча ближайшая. Сводка уходит, только если за месяц ЧТО-ТО было — пустая " +
      "была бы ежемесячным напоминанием о том, что сообщество мертво. Нужны привязанный " +
      "Telegram и включённый переключатель «Сообщества» в настройках уведомлений.",
    supportsTargets: false,
    logKind: "community-digest",
    logsItems: false,
    intervalDays: 30,
    defaultHour: 11,
    run: async () => {
      const { sendCommunityMonthlySummaries } = await import("@/lib/telegramNotifications");
      const sent = await sendCommunityMonthlySummaries();
      return `отправлено ${sent}`;
    },
  },
  {
    key: "cleanup-expired",
    group: "service",
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
  const [birthdays, episodes, eventReminders, presales, performerEvents] = await Promise.all([
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
    // «Новое событие избранного артиста»: повторно повод возможен лишь
    // при привязке ещё одного артиста к старому событию — а это и есть
    // новость, так что просроченная отметка ничего не ломает.
    prisma.performerEventNotification.deleteMany({
      where: { createdAt: { lt: daysAgo(TELEGRAM_DEDUPE_RETENTION_DAYS) } },
    }),
  ]);

  const dedupe =
    birthdays.count + episodes.count + eventReminders.count + presales.count + performerEvents.count;
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
      hour: row?.hour ?? def.defaultHour ?? 4,
      targetMode: row?.targetMode ?? ("ALL" as const),
      targets: row?.targets.map((t) => t.performer) ?? [],
      lastRunAt: row?.lastRunAt ?? null,
      lastStatus: row?.lastStatus ?? null,
      lastSummary: row?.lastSummary ?? null,
      resumeAt: row?.resumeAt ?? null,
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
 *
 * `resumeAt` (см. ScheduledJob.resumeAt) перебивает оба правила: задача
 * отработала пачку и попросила продолжить — продолжаем, как только
 * настанет это время.
 *
 * `weekday` (0 — воскресенье) добавляет к этому жёсткий день недели: в
 * другие дни задача не due вовсе, сколько бы времени ни прошло. День
 * берётся в той же зоне процесса, что и час, — иначе воскресный
 * дайджест в 10 утра МСК уезжал бы то в субботу, то в понедельник.
 */
export function isDue(
  hour: number,
  lastRunAt: Date | null,
  now: Date,
  intervalDays = 1,
  weekday?: number,
  resumeAt?: Date | null,
): boolean {
  // Недоделанная пачка продолжается, как только настал её час «разбуди
  // меня»: ни расписание, ни «раз в сутки» тут не при чём — круг уже
  // начат, и бросать его на середине до завтра незачем.
  if (resumeAt) return now.getTime() >= resumeAt.getTime();
  if (now.getHours() < hour) return false;
  if (weekday !== undefined && now.getDay() !== weekday) return false;
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
    // resumeAt гасим при захвате: просьбу продолжить задача поставит
    // заново, если ей и после этой пачки будет что делать.
    data: { lastRunAt: now, lastStatus: "RUNNING", resumeAt: null },
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
    if (
      !job.enabled ||
      !isDue(job.hour, job.lastRunAt, now, job.intervalDays ?? 1, job.weekday, job.resumeAt)
    )
      continue;
    // Отметку ставим ДО запуска: прогон длинный, и при перезапуске
    // приложения задача не должна стартовать второй раз за сутки.
    if (!(await claimJob(job.key, job.hour, job.lastRunAt, now))) continue;
    started.push(job.key);

    const targetIds =
      job.supportsTargets && job.targetMode === "SELECTED"
        ? job.targets.map((t) => t.id)
        : null;

    try {
      const outcome = jobOutcome(await job.run(targetIds));
      await prisma.scheduledJob.update({
        where: { key: job.key },
        data: {
          lastStatus: "DONE",
          lastSummary: outcome.summary,
          // Задача попросила продолжить — следующий тик после этого
          // времени возьмёт следующую пачку.
          resumeAt: outcome.resumeInMinutes
            ? new Date(Date.now() + outcome.resumeInMinutes * 60_000)
            : null,
        },
      });
    } catch (err) {
      await prisma.scheduledJob.update({
        where: { key: job.key },
        data: {
          lastStatus: "FAILED",
          lastSummary: err instanceof Error ? err.message : String(err),
          // Упавшую задачу пачками не догоняем: следующая попытка — в
          // свой час завтра, иначе сломанный источник долбился бы
          // каждые десять минут до утра.
          resumeAt: null,
        },
      });
      console.warn(`scheduled job ${job.key} failed:`, err);
    }
  }

  return started;
}
