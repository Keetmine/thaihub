import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { privateUploadsDir } from "@/lib/privateUploads";
import { checkImportCancelled, isImportCancelledError } from "@/lib/importRun";
import { MdlRunFetcher } from "@/lib/mdlClient";
import { absMdlUrl, mdlSearchUrl, parseMdlSearchTitles } from "@/lib/mydramalist";
import { upsertDramaFromMdl } from "@/lib/mdlDramaImport";
import { linkMdlCast } from "@/lib/mdlCastLink";
// Карта «их русская страна → наша английская» уже есть у asiapoisk —
// вторая копия разъехалась бы с первой.
import { normalizeCountry } from "@/lib/asiapoisk";
import {
  collectDoramaLandSeriesUrls,
  doramaLandMatchTitles,
  fetchDoramaLandPage,
  isWantedForImport,
  mergeTitleVariants,
  type DoramaLandPage,
} from "@/lib/doramaland";

/**
 * Сведение каталога с dorama.land — русские названия и описания
 * (решение владельца, Ж4б). Общее ядро для двух режимов:
 *
 * - `runDoramaLandFullSync` — разовый обход всего их каталога
 *   (`scripts/doramaland-sync.ts`): каждая их страница разбирается и
 *   сводится с нашей записью;
 * - `runDoramaLandDaily` — ежедневная задача расписания
 *   («doramaland-sync» в JOB_DEFINITIONS): только то, что появилось у
 *   них или у нас с прошлого раза. Их sitemap не помогает отличить
 *   новое: `lastmod` у страниц сериалов — это время генерации карты
 *   (одна секунда на все 1800 страниц), а не правки страницы. Поэтому
 *   «новое» — это адреса, которых нет ни в кэше разобранных страниц, ни
 *   в `Drama.doramalandUrl`.
 *
 * Обе дороги держат один кэш разобранных страниц на диске
 * (`private-uploads/doramaland-cache.json`): прерванный прогон
 * продолжается с места обрыва, а ежедневная задача не перечитывает их
 * каталог целиком — читает только незнакомые адреса. Наши сериалы, у
 * которых `titleRu` уже стоит, не трогаются вовсе, и на их страницы
 * dorama.land никто не ходит.
 */

/** Пауза между запросами к dorama.land — мы у них в гостях. */
const PAGE_DELAY_MS = 350;
/** Пауза между запросами к MDL — как у остальных MDL-парсеров. */
const MDL_DELAY_MS = 1500;
/** Сколько незнакомых страниц dorama.land читает ежедневный прогон.
 *  Обычный день — единицы новых страниц; потолок нужен на первый прогон
 *  без кэша (весь их каталог) и на случай, если кэш потеряли: тогда
 *  каталог добирается по кускам, а не за одну ночь тысячами запросов. */
export const DAILY_MAX_PAGES = 300;
/** Сколько их сериалов без нашей записи за прогон ищется на MDL. Поиск
 *  плюс импорт — это 3–5 запросов к MDL на тайтл, и хвост из тысяч
 *  тайских сериалов, которых у нас нет, не должен уходить за одну ночь. */
export const DAILY_MAX_MDL_LOOKUPS = 40;
/** Через сколько дней снова искать на MDL то, что там не нашлось:
 *  страница на MDL могла появиться позже, чем перевод на dorama.land. */
const NO_MDL_RETRY_DAYS = 30;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- кэш разобранных страниц и состояние ежедневного прогона ----------

type PageCache = Record<string, DoramaLandPage>;

/** Кэш: url → разобранная страница. Формат общий со скриптом. */
function cacheFile(): string {
  return privateUploadsDir("doramaland-cache.json");
}

/** Состояние ежедневной задачи — что уже решено и повторно смотреть не
 *  нужно. Отдельным файлом, чтобы формат кэша не менялся. */
type DailyState = {
  lastRunAt: string | null;
  /** url → ISO-дата: страница совпала с нашим сериалом, у которого
   *  перевод уже есть (с другой их страницы) — делать нечего. */
  settled: Record<string, string>;
  /** url → ISO-дата последней неудачной попытки найти сериал на MDL. */
  noMdl: Record<string, string>;
};

function stateFile(): string {
  return privateUploadsDir("doramaland-sync-state.json");
}

export async function loadDoramaLandCache(): Promise<PageCache> {
  try {
    return JSON.parse(await readFile(cacheFile(), "utf8"));
  } catch {
    return {};
  }
}

export async function saveDoramaLandCache(cache: PageCache): Promise<void> {
  await mkdir(path.dirname(cacheFile()), { recursive: true });
  await writeFile(cacheFile(), JSON.stringify(cache));
}

async function loadState(): Promise<DailyState> {
  try {
    const raw = JSON.parse(await readFile(stateFile(), "utf8"));
    return {
      lastRunAt: typeof raw.lastRunAt === "string" ? raw.lastRunAt : null,
      settled: raw.settled && typeof raw.settled === "object" ? raw.settled : {},
      noMdl: raw.noMdl && typeof raw.noMdl === "object" ? raw.noMdl : {},
    };
  } catch {
    return { lastRunAt: null, settled: {}, noMdl: {} };
  }
}

async function saveState(state: DailyState): Promise<void> {
  await mkdir(path.dirname(stateFile()), { recursive: true });
  await writeFile(stateFile(), JSON.stringify(state));
}

// ---------- сведение с нашей записью ----------

const DRAMA_SELECT = {
  id: true,
  slug: true,
  title: true,
  nativeTitle: true,
  alsoKnownAs: true,
  year: true,
  titleRu: true,
  synopsisRu: true,
  doramalandUrl: true,
  // Для проверки совпадения: их «Китай» против нашего «Thailand» —
  // самый дешёвый способ поймать однофамильцев.
  country: true,
} as const;

type DramaRow = {
  id: string;
  slug: string | null;
  title: string;
  nativeTitle: string | null;
  alsoKnownAs: string | null;
  year: number | null;
  titleRu: string | null;
  synopsisRu: string | null;
  doramalandUrl: string | null;
  country: string | null;
};

/** Тайское «Оригинальное» с их страницы — ключ к нашему nativeTitle. */
function thaiOriginal(page: DoramaLandPage): string | null {
  if (!page.original || !/[฀-๿]/.test(page.original)) return null;
  return page.original.replace(/\s*Special$/i, "").trim();
}

/**
 * Наша запись для их страницы. Правила — как в закалённом MDL-сведении:
 * год обязателен (окно ±1: даты анонсов плавают), совпадение должно
 * быть однозначным (двое кандидатов — пропуск). Оригинальное тайское
 * название сверяем с нашим nativeTitle — у тайских сериалов это самый
 * надёжный ключ. Каждый кандидат из запроса проходит через
 * `verifyDoramaLandMatch` — там страна и точное совпадение названия.
 */
export async function findOurDramaForPage(page: DoramaLandPage): Promise<DramaRow | null> {
  const titles = doramaLandMatchTitles(page);
  const thai = thaiOriginal(page);
  if (titles.length === 0 && !thai) return null;

  const yearWhere = page.year ? { year: { gte: page.year - 1, lte: page.year + 1 } } : {};
  // Запрос — только грубый отбор: `contains` по alsoKnownAs ловит и
  // подстроки, поэтому каждый кандидат ниже проверяется как следует.
  // take больше двух: раньше лишний однофамилец мог вытеснить настоящее
  // совпадение из выборки ещё до проверки.
  const candidates = await prisma.drama.findMany({
    where: {
      OR: [
        ...titles.flatMap((title) => [
          { title: { equals: title, mode: "insensitive" as const } },
          { alsoKnownAs: { contains: title, mode: "insensitive" as const } },
        ]),
        ...(thai ? [{ nativeTitle: thai }] : []),
      ],
      ...yearWhere,
    },
    select: DRAMA_SELECT,
    take: 10,
  });
  const verified = candidates.filter((drama) => verifyDoramaLandMatch(drama, page));
  return verified.length === 1 ? verified[0] : null;
}

/**
 * Настоящая проверка совпадения — после грубого отбора запросом.
 *
 * Появилась после ложного совпадения (жалоба владельца 2026-09-07):
 * нашему тайскому «Reset» (2025) досталось название и описание
 * китайского «Возрождения из ледяного озера» (2026). Виноваты были две
 * вещи сразу:
 *
 * 1. `alsoKnownAs` — это ОДНА строка через запятую, и `contains`
 *    сравнивал подстроку: их «Rebirth» нашёлся внутри нашего «The
 *    Rebirth of a Star». Теперь название обязано совпасть с ЦЕЛЫМ
 *    элементом списка.
 * 2. Страна не сверялась вовсе. Их «Китай» против нашего «Thailand»
 *    отбрасывает совпадение сразу — то же правило, что у asiapoisk
 *    (см. docs/features/asiapoisk-import.md).
 */
export function verifyDoramaLandMatch(
  drama: Pick<DramaRow, "title" | "nativeTitle" | "alsoKnownAs" | "year" | "country">,
  page: DoramaLandPage,
): boolean {
  // Страна сверяется, только когда известна у обоих: у части наших
  // записей её нет, и это не повод отказываться от перевода.
  const theirCountry = normalizeCountry(page.country);
  if (theirCountry && drama.country && theirCountry !== drama.country) return false;

  // Год: то же окно ±1, что в запросе (даты анонсов плавают). Дублируем
  // здесь, чтобы проверка работала и в разовом перепрогоне.
  if (page.year != null && drama.year != null && Math.abs(drama.year - page.year) > 1) {
    return false;
  }

  const thai = thaiOriginal(page);
  if (thai && drama.nativeTitle && drama.nativeTitle.trim() === thai) return true;

  const ours = new Set(
    [drama.title, ...(drama.alsoKnownAs ?? "").split(",")]
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
  );
  return doramaLandMatchTitles(page).some((title) => ours.has(title.trim().toLowerCase()));
}

/**
 * Записать русские поля. Заполненное не перезаписывается (кроме
 * `overwrite`); варианты названий доливаются в alsoKnownAs. С `apply:
 * false` только считает, что записалось бы.
 */
async function applyRuFields(
  drama: DramaRow,
  page: DoramaLandPage,
  opts: { apply: boolean; overwrite: boolean },
): Promise<void> {
  if (!opts.apply) return;
  const titleRu = opts.overwrite ? page.titleRu : (drama.titleRu ?? page.titleRu);
  const synopsisRu = opts.overwrite ? page.descriptionRu : (drama.synopsisRu ?? page.descriptionRu);
  const alsoKnownAs = mergeTitleVariants(
    drama.alsoKnownAs,
    [...(page.titleRu ? [page.titleRu] : []), ...page.altTitles, ...(page.original ? [page.original] : [])],
    [drama.title, drama.nativeTitle, titleRu],
  );
  await prisma.drama.update({
    where: { id: drama.id },
    data: { titleRu, synopsisRu, alsoKnownAs, doramalandUrl: page.sourceUrl },
  });
}

/** Есть ли на странице что-то, чего у записи ещё нет. */
function pageAddsSomething(drama: DramaRow, page: DoramaLandPage, overwrite: boolean): boolean {
  return (
    overwrite ||
    (!drama.titleRu && !!page.titleRu) ||
    (!drama.synopsisRu && !!page.descriptionRu) ||
    drama.doramalandUrl !== page.sourceUrl
  );
}

// ---------- их сериал, которого у нас нет: сперва MDL, потом перевод ----------

/** Поиск страницы MDL для их сериала: точное название + год, однозначно. */
async function findMdlUrl(
  fetcher: MdlRunFetcher,
  page: DoramaLandPage,
  runId: string | null | undefined,
): Promise<string | null> {
  for (const title of doramaLandMatchTitles(page)) {
    await checkImportCancelled(runId);
    try {
      const html = await fetcher.fetchHtml(mdlSearchUrl(title));
      const results = parseMdlSearchTitles(html);
      const exact = results.filter((r) => r.title.trim().toLowerCase() === title.toLowerCase());
      const withYear = page.year
        ? exact.filter((r) => r.year != null && Math.abs(r.year - page.year!) <= 1)
        : exact;
      const pick = (withYear.length > 0 ? withYear : exact).slice(0, 2);
      if (pick.length === 1) return absMdlUrl(pick[0].path);
    } catch (e) {
      if (isImportCancelledError(e)) throw e;
      // поиск по одному из названий не удался — пробуем следующее
    }
    await sleep(MDL_DELAY_MS);
  }
  return null;
}

type MdlImportOutcome =
  | { status: "no-mdl" }
  | { status: "dry-run"; mdlUrl: string }
  | { status: "imported"; dramaId: string; slug: string | null; title: string; castLinked: number };

/**
 * Завести их сериал у нас: найти на MDL, импортировать обычным
 * MDL-импортом (постер, синопсис, расписание серий, связи; каст —
 * урезанным отбором из той же страницы, как у вахты новинок MDL) и
 * долить русские поля. Не нашёлся на MDL — ничего не заводим: голая
 * запись без постера и данных хуже, чем никакой.
 */
async function importMissingFromMdl(
  fetcher: MdlRunFetcher,
  page: DoramaLandPage,
  opts: { apply: boolean; overwrite: boolean; autoUpdate: boolean; runId?: string | null },
): Promise<MdlImportOutcome> {
  const mdlUrl = await findMdlUrl(fetcher, page, opts.runId);
  if (!mdlUrl) return { status: "no-mdl" };
  if (!opts.apply) return { status: "dry-run", mdlUrl };

  await sleep(MDL_DELAY_MS);
  const result = await upsertDramaFromMdl(mdlUrl, {
    fetchHtml: fetcher.fetchHtml,
    autoUpdate: opts.autoUpdate,
  });
  // Каст — из той же уже скачанной страницы, лишних запросов к MDL это
  // не добавляет. Только под журналом: linkMdlCast пишет заведённых
  // актёров в ImportedItem прогона, а у скрипта прогона нет.
  const cast = opts.runId
    ? await linkMdlCast(result.id, result.mdl.cast, {
        runId: opts.runId,
        scope: "main-and-known-support",
        enrich: false,
      })
    : null;
  const fresh = await prisma.drama.findUnique({ where: { id: result.id }, select: DRAMA_SELECT });
  if (fresh) await applyRuFields(fresh, page, { apply: true, overwrite: opts.overwrite });
  return {
    status: "imported",
    dramaId: result.id,
    slug: fresh?.slug ?? null,
    title: result.title,
    castLinked: cast?.linked ?? 0,
  };
}

/** Строка ленты «Спарсенное» на вкладке задачи — только при прогоне из
 *  журнала (runId) и только по факту записи. */
async function logItem(
  runId: string | null | undefined,
  entityId: string,
  action: "created" | "updated",
  label: string,
): Promise<void> {
  if (!runId) return;
  await prisma.importedItem.create({
    data: { runId, entityType: "drama", entityId, action, label },
  });
}

/** Все занятые их адреса: одна их страница — один наш сериал. */
async function assignedUrls(): Promise<Set<string>> {
  const rows = await prisma.drama.findMany({
    where: { doramalandUrl: { not: null } },
    select: { doramalandUrl: true },
  });
  return new Set(rows.map((r) => r.doramalandUrl!).filter(Boolean));
}

// ---------- ежедневный прогон ----------

export type DoramaLandDailyResult = {
  /** Страниц сериалов в их sitemap. */
  sitemapUrls: number;
  /** Из них незнакомых (нет ни в кэше, ни в doramalandUrl). */
  newUrls: number;
  /** Сколько незнакомых прочитали за прогон. */
  pagesFetched: number;
  /** Незнакомых, до которых не дошли из-за лимита, — на следующий раз. */
  pagesBacklog: number;
  /** Нашим сериалам без перевода дописали русские поля. */
  translated: number;
  translatedTitles: string[];
  /** Заведено с MDL (при сухом прогоне — «завели бы»). */
  importedFromMdl: number;
  importedTitles: string[];
  /** Сколько раз ходили искать на MDL. */
  mdlLookups: number;
  /** Их сериалов без нашей записи, до которых MDL-поиск не дошёл. */
  mdlBacklog: number;
  /** Не нашлись на MDL — запись не создаём, только в отчёт. */
  noMdl: number;
  noMdlTitles: string[];
  castLinked: number;
  failed: number;
  errors: string[];
  dryRun: boolean;
};

/**
 * Ежедневная задача: «есть ли у них что-то новое, чего у нас нет, либо
 * что-то новое с переводом, что у нас уже есть».
 *
 * 1. Sitemap → адреса страниц сериалов. Незнакомые (нет в кэше и не
 *    заняты `doramalandUrl`) читаются — не больше `maxPages` за прогон,
 *    остаток дочитывается в следующие дни.
 * 2. Наши сериалы без `titleRu` сводятся с кэшем в памяти (название,
 *    варианты, nativeTitle + год ±1, однозначно с обеих сторон) — так
 *    перевод находится и для сериала, заведённого у нас позже, чем их
 *    страница попала в кэш. Запросов к dorama.land тут нет.
 * 3. Прочитанные за прогон страницы, а за ними хвост их сериалов без
 *    нашей записи (Таиланд или яой/BL): совпало с нашим — дописали
 *    перевод; не совпало и профиль наш — ищем на MDL и заводим обычным
 *    импортом, не больше `maxMdlLookups` за прогон. Не нашёлся на MDL —
 *    в отчёт и в состояние, чтобы не искать снова раньше чем через
 *    NO_MDL_RETRY_DAYS.
 *
 * Сериалы с заполненным `titleRu` не трогаются и на их страницы никто
 * не ходит. С `apply: false` ничего не пишется ни в БД, ни в состояние
 * (кэш страниц пополняется — это просто разобранный HTML).
 */
export async function runDoramaLandDaily(opts: {
  runId?: string | null;
  apply?: boolean;
  maxPages?: number;
  maxMdlLookups?: number;
  /** Заводить ли недостающее с MDL (по умолчанию да). */
  importMissing?: boolean;
  log?: (message: string) => void;
}): Promise<DoramaLandDailyResult> {
  const apply = opts.apply ?? true;
  const importMissing = opts.importMissing ?? true;
  const maxPages = opts.maxPages ?? DAILY_MAX_PAGES;
  const maxMdlLookups = opts.maxMdlLookups ?? DAILY_MAX_MDL_LOOKUPS;
  const log = opts.log ?? (() => {});
  const runId = opts.runId ?? null;
  const now = new Date();

  const result: DoramaLandDailyResult = {
    sitemapUrls: 0,
    newUrls: 0,
    pagesFetched: 0,
    pagesBacklog: 0,
    translated: 0,
    translatedTitles: [],
    importedFromMdl: 0,
    importedTitles: [],
    mdlLookups: 0,
    mdlBacklog: 0,
    noMdl: 0,
    noMdlTitles: [],
    castLinked: 0,
    failed: 0,
    errors: [],
    dryRun: !apply,
  };

  const cache = await loadDoramaLandCache();
  const state = await loadState();
  const assigned = await assignedUrls();
  const fetcher = importMissing ? new MdlRunFetcher({ onNotice: log }) : null;

  const fail = (what: string, e: unknown) => {
    result.failed += 1;
    if (result.errors.length < 10) {
      result.errors.push(`${what}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    }
  };

  try {
    // 1. Незнакомые адреса из sitemap.
    await checkImportCancelled(runId);
    log("Читаю sitemap dorama.land…");
    const urls = await collectDoramaLandSeriesUrls();
    result.sitemapUrls = urls.length;
    const fresh = urls.filter((u) => !cache[u] && !assigned.has(u));
    result.newUrls = fresh.length;
    result.pagesBacklog = Math.max(0, fresh.length - maxPages);
    log(`Страниц сериалов: ${urls.length}, незнакомых: ${fresh.length}`);

    const fetchedPages: DoramaLandPage[] = [];
    for (const url of fresh.slice(0, maxPages)) {
      await checkImportCancelled(runId);
      try {
        const page = await fetchDoramaLandPage(url);
        cache[url] = page;
        fetchedPages.push(page);
        result.pagesFetched += 1;
        if (result.pagesFetched % 50 === 0) await saveDoramaLandCache(cache);
      } catch (e) {
        if (isImportCancelledError(e)) throw e;
        fail(url, e);
      }
      await sleep(PAGE_DELAY_MS);
    }
    if (fetchedPages.length) await saveDoramaLandCache(cache);

    // 2. Наши сериалы без перевода — против кэша, без запросов.
    const translate = async (drama: DramaRow, page: DoramaLandPage) => {
      await applyRuFields(drama, page, { apply, overwrite: false });
      assigned.add(page.sourceUrl);
      result.translated += 1;
      if (result.translatedTitles.length < 20) result.translatedTitles.push(drama.title);
      if (apply) await logItem(runId, drama.id, "updated", `${drama.title} → «${page.titleRu ?? "?"}»`);
      log(`  перевод: «${page.titleRu}» → ${drama.slug ?? drama.id}`);
    };

    const ours = await prisma.drama.findMany({ where: { titleRu: null }, select: DRAMA_SELECT });
    const index = buildPageIndex(cache, assigned);
    for (const drama of ours) {
      await checkImportCancelled(runId);
      // Ссылка уже стоит, а перевода нет — берём её страницу из кэша.
      if (drama.doramalandUrl) {
        const page = cache[drama.doramalandUrl];
        if (page && pageAddsSomething(drama, page, false)) await translate(drama, page);
        continue;
      }
      const candidates = pagesForDrama(index, drama);
      if (candidates.length !== 1) continue;
      const page = candidates[0];
      if (assigned.has(page.sourceUrl)) continue;
      // Однозначность и с нашей стороны — теми же правилами, что у
      // сведения «страница → запись».
      const verified = await findOurDramaForPage(page);
      if (verified?.id !== drama.id) continue;
      await translate(drama, page);
    }

    // 3. Новые страницы, затем хвост их сериалов без нашей записи.
    const retryBefore = new Date(now.getTime() - NO_MDL_RETRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const fetchedUrls = new Set(fetchedPages.map((p) => p.sourceUrl));
    const backlog = Object.values(cache).filter(
      (p) =>
        !fetchedUrls.has(p.sourceUrl) &&
        !assigned.has(p.sourceUrl) &&
        !state.settled[p.sourceUrl] &&
        isWantedForImport(p) &&
        (!state.noMdl[p.sourceUrl] || state.noMdl[p.sourceUrl] < retryBefore),
    );

    const seenThisRun = new Set<string>();
    for (const [i, page] of [...fetchedPages, ...backlog].entries()) {
      await checkImportCancelled(runId);
      const url = page.sourceUrl;
      if (assigned.has(url) || seenThisRun.has(url)) continue;
      seenThisRun.add(url);
      const isNew = i < fetchedPages.length;

      // Хвост смотрим только пока есть квота на MDL: сведение с нашими
      // записями для него уже сделал шаг 2, а MDL-поиск — единственное,
      // что тут стоит запросов.
      if (!isNew && result.mdlLookups >= maxMdlLookups) {
        result.mdlBacklog += 1;
        continue;
      }

      let ourDrama: DramaRow | null;
      try {
        ourDrama = await findOurDramaForPage(page);
      } catch (e) {
        if (isImportCancelledError(e)) throw e;
        fail(url, e);
        continue;
      }
      if (ourDrama) {
        if (pageAddsSomething(ourDrama, page, false) && !ourDrama.titleRu) {
          await translate(ourDrama, page);
        } else {
          // Перевод уже есть (с другой их страницы) — больше не смотрим.
          assigned.add(url);
          state.settled[url] = now.toISOString();
        }
        continue;
      }
      if (!isWantedForImport(page) || !fetcher) continue;
      if (result.mdlLookups >= maxMdlLookups) {
        result.mdlBacklog += 1;
        continue;
      }

      result.mdlLookups += 1;
      log(`Ищу на MDL: «${page.titleRu}» (${page.year ?? "год?"})`);
      try {
        const outcome = await importMissingFromMdl(fetcher, page, {
          apply,
          overwrite: false,
          // Их новинки обычно ещё выходят — ночному обновлению MDL они
          // нужнее всех, как и у вахты новинок по поискам.
          autoUpdate: true,
          runId,
        });
        if (outcome.status === "no-mdl") {
          result.noMdl += 1;
          if (result.noMdlTitles.length < 20) {
            result.noMdlTitles.push(`${page.titleRu ?? url} (${page.year ?? "год?"})`);
          }
          state.noMdl[url] = now.toISOString();
          log(`  нет на MDL: «${page.titleRu}» ${url}`);
          continue;
        }
        result.importedFromMdl += 1;
        if (outcome.status === "dry-run") {
          if (result.importedTitles.length < 20) result.importedTitles.push(page.titleRu ?? url);
          log(`  [заведём] «${page.titleRu}» ← ${outcome.mdlUrl}`);
          continue;
        }
        assigned.add(url);
        result.castLinked += outcome.castLinked;
        if (result.importedTitles.length < 20) result.importedTitles.push(outcome.title);
        await logItem(runId, outcome.dramaId, "created", `${outcome.title} → «${page.titleRu ?? "?"}»`);
        log(`  [заведён] «${page.titleRu}» → ${outcome.slug ?? outcome.dramaId}`);
      } catch (e) {
        if (isImportCancelledError(e)) throw e;
        fail(`«${page.titleRu ?? url}»`, e);
      }
      await sleep(MDL_DELAY_MS);
    }

    state.lastRunAt = now.toISOString();
    if (apply) await saveState(state);
  } finally {
    // И при остановке кнопкой, и при падении: незакрытый chromium остался
    // бы висеть, а прочитанные страницы — потеряны.
    await fetcher?.close();
    await saveDoramaLandCache(cache);
  }

  return result;
}

/** Ключи в индексе: латинские варианты названия + тайский оригинал,
 *  без регистра. Кириллицу не индексируем — у нас её нет. */
function pageKeys(page: DoramaLandPage): string[] {
  const keys = doramaLandMatchTitles(page).map((t) => t.toLowerCase());
  const thai = thaiOriginal(page);
  if (thai) keys.push(thai.toLowerCase());
  return keys;
}

function buildPageIndex(cache: PageCache, assigned: Set<string>): Map<string, DoramaLandPage[]> {
  const index = new Map<string, DoramaLandPage[]>();
  for (const page of Object.values(cache)) {
    if (assigned.has(page.sourceUrl)) continue;
    for (const key of new Set(pageKeys(page))) {
      const list = index.get(key);
      if (list) list.push(page);
      else index.set(key, [page]);
    }
  }
  return index;
}

/** Страницы-кандидаты для нашей записи: по названию, вариантам и
 *  nativeTitle, в окне года ±1 (как у сведения «страница → запись»). */
function pagesForDrama(index: Map<string, DoramaLandPage[]>, drama: DramaRow): DoramaLandPage[] {
  const keys = new Set(
    [drama.title, drama.nativeTitle ?? "", ...(drama.alsoKnownAs ?? "").split(",")]
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  const out = new Map<string, DoramaLandPage>();
  for (const key of keys) {
    for (const page of index.get(key) ?? []) {
      if (page.year && (drama.year == null || Math.abs(drama.year - page.year) > 1)) continue;
      out.set(page.sourceUrl, page);
    }
  }
  return [...out.values()];
}

/** Сводка ежедневного прогона — в журнал и в строку «последний результат». */
export function summarizeDoramaLandDaily(r: DoramaLandDailyResult): string {
  const head = (r.importedTitles.length ? `: ${r.importedTitles.slice(0, 5).join(", ")}` : "");
  return (
    `в sitemap ${r.sitemapUrls}, новых ${r.newUrls}, прочитано ${r.pagesFetched}` +
    (r.pagesBacklog ? ` (осталось ${r.pagesBacklog})` : "") +
    `, переводов дописано ${r.translated}` +
    (r.translatedTitles.length ? ` (${r.translatedTitles.slice(0, 5).join(", ")})` : "") +
    `, ${r.dryRun ? "завели бы" : "заведено"} с MDL ${r.importedFromMdl}${head}` +
    (r.castLinked ? `, каст +${r.castLinked}` : "") +
    `, не нашлись на MDL ${r.noMdl}` +
    (r.noMdlTitles.length ? ` (${r.noMdlTitles.slice(0, 5).join(", ")})` : "") +
    (r.mdlBacklog ? `, ждут MDL-поиска ещё ${r.mdlBacklog}` : "") +
    `, ошибок ${r.failed}` +
    (r.errors.length ? ` (${r.errors.slice(0, 3).join("; ")})` : "") +
    (r.dryRun ? " · сухой прогон, ничего не записано" : "")
  );
}

// ---------- разовый полный обход (scripts/doramaland-sync.ts) ----------

export type DoramaLandFullSyncResult = {
  pages: number;
  fetched: number;
  matched: number;
  enriched: number;
  importedFromMdl: number;
  noMdl: DoramaLandPage[];
  unmatchedWanted: number;
  failed: number;
};

/**
 * Полный обход их каталога: каждая страница сериала (из кэша или с
 * сайта) сводится с нашей записью; с `importMissing` их сериалы без
 * нашей записи (Таиланд или яой/BL) заводятся через MDL.
 */
export async function runDoramaLandFullSync(opts: {
  apply: boolean;
  importMissing: boolean;
  overwrite: boolean;
  limit?: number;
  log?: (message: string) => void;
}): Promise<DoramaLandFullSyncResult> {
  const log = opts.log ?? (() => {});
  log("Собираю страницы сериалов из sitemap…");
  const all = await collectDoramaLandSeriesUrls();
  const urls = opts.limit != null && Number.isFinite(opts.limit) ? all.slice(0, opts.limit) : all;
  log(`Страниц сериалов: ${urls.length}${opts.apply ? "" : " (черновой прогон)"}`);

  const cache = await loadDoramaLandCache();
  const result: DoramaLandFullSyncResult = {
    pages: urls.length,
    fetched: 0,
    matched: 0,
    enriched: 0,
    importedFromMdl: 0,
    noMdl: [],
    unmatchedWanted: 0,
    failed: 0,
  };
  const unmatchedWanted: DoramaLandPage[] = [];
  const fetcher = opts.importMissing ? new MdlRunFetcher({ onNotice: log }) : null;

  try {
    for (const [i, url] of urls.entries()) {
      let page = cache[url];
      if (!page) {
        try {
          page = await fetchDoramaLandPage(url);
        } catch (e) {
          result.failed += 1;
          log(`  [ошибка] ${url}: ${e instanceof Error ? e.message : e}`);
          continue;
        }
        cache[url] = page;
        result.fetched += 1;
        if (result.fetched % 50 === 0) await saveDoramaLandCache(cache);
        await sleep(PAGE_DELAY_MS);
      }

      const ours = await findOurDramaForPage(page);
      if (ours) {
        result.matched += 1;
        if (pageAddsSomething(ours, page, opts.overwrite)) {
          result.enriched += 1;
          await applyRuFields(ours, page, { apply: opts.apply, overwrite: opts.overwrite });
          if (result.enriched <= 5 || result.enriched % 50 === 0) {
            log(`  «${page.titleRu}» → ${ours.slug ?? ours.id}`);
          }
        }
      } else if (isWantedForImport(page)) {
        unmatchedWanted.push(page);
      }

      if ((i + 1) % 100 === 0) log(`  …${i + 1} из ${urls.length}`);
    }
    await saveDoramaLandCache(cache);
    result.unmatchedWanted = unmatchedWanted.length;

    // Прогон 2: заводим недостающее — сперва MDL, затем русские поля.
    if (fetcher) {
      log(`\nИх сериалов без нашей записи (Таиланд или яой/BL): ${unmatchedWanted.length}`);
      for (const page of unmatchedWanted) {
        try {
          const outcome = await importMissingFromMdl(fetcher, page, {
            apply: opts.apply,
            overwrite: opts.overwrite,
            autoUpdate: false,
          });
          if (outcome.status === "no-mdl") {
            result.noMdl.push(page);
            continue;
          }
          result.importedFromMdl += 1;
          if (outcome.status === "dry-run") log(`  [заведём] «${page.titleRu}» ← ${outcome.mdlUrl}`);
          else log(`  [заведён] «${page.titleRu}» → ${outcome.slug ?? outcome.dramaId}`);
        } catch (e) {
          result.failed += 1;
          log(`  [ошибка импорта] «${page.titleRu}»: ${e instanceof Error ? e.message : e}`);
        }
        await sleep(MDL_DELAY_MS);
      }
    }
  } finally {
    await fetcher?.close();
    await saveDoramaLandCache(cache);
  }

  return result;
}
