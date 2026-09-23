import { prisma } from "@/lib/prisma";
import { checkImportCancelled, isImportCancelledError } from "@/lib/importRun";
import { MdlRunFetcher } from "@/lib/mdlClient";
import { isAlternateVersionError, upsertDramaFromMdl } from "@/lib/mdlDramaImport";
import { linkMdlCast } from "@/lib/mdlCastLink";
import {
  absMdlUrl,
  MdlHttpError,
  parseMdlSearchTitles,
  type MdlSearchTitle,
} from "@/lib/mydramalist";

// Импорт по ссылке на страницу поиска MyDramaList.
//
// Смысл: фильтры MDL (теги, статус, сортировка) гораздо богаче всего,
// что мы могли бы повторить у себя, а вставить готовый адрес выдачи —
// одно движение. Владелица набирает ссылку прямо на MDL
// («gay romance, сейчас выходит, сначала новые»), вставляет сюда, а мы
// обходим пагинацию и прогоняем каждый найденный тайтл через обычный
// импорт сериала.
//
// Каст прогон связывает сам, но урезанным отбором: главные роли
// целиком, второй план — только знакомые нам актёры с агентством,
// гости не берутся. Разбирается он из уже скачанной страницы сериала,
// так что лишних запросов к MDL это не добавляет (см. mdlCastLink.ts).
// Связи из Related Content пишет общий upsertDramaFromMdl — тоже из
// уже скачанной страницы и только между сериалами, которые уже есть в
// каталоге.
//
// Ходим ОБЫЧНЫМ fetch с браузерным UA, а chromium поднимаем только
// если MDL закрылся Cloudflare-проверкой — и тогда ОДИН на весь прогон
// (`MdlRunFetcher`), общий для страниц выдачи и страниц тайтлов.
// Браузер на каждую страницу превратил бы импорт в многочасовой, а без
// браузера вовсе прогон просто не работал в закрытые дни.
//
// Правовая сторона (см. docs/roadmap.md, пункт Ж3): официального ключа
// к API MDL не выдают, но и прямого запрета на автоматический доступ в
// правилах нет. Риск снижаем тем же, чем и в остальных импортах:
// ходим редко и только по явной команде, последовательно и с паузой,
// храним факты (даты, серии, статус), а не тексты и постеры чужого
// авторства как свои, и оставляем на карточке ссылку-атрибуцию
// (`Drama.mydramalistUrl` → кнопка «MyDramaList ↗» на странице
// сериала).

/** Потолок обхода: 50 страниц по 20 карточек — до 1000 тайтлов.
 *  Ссылка на поиск бывает слишком широкой («все LGBTQ+ тайтлы»), и без
 *  потолка один прогон ушёл бы на тысячи страниц сериалов. */
const MAX_PAGES = 50;

/** Пауза между запросами. Мы у MDL в гостях: ходим последовательно и
 *  не быстрее одного запроса в полторы секунды. */
const REQUEST_DELAY_MS = 1500;

/** Подряд упавших импортов, после которых прогон сдаётся. Одиночная
 *  ошибка — это удалённая страница, а десять подряд означают, что нас
 *  перестали пускать: дальше идти по списку бессмысленно. */
const FAILURE_STREAK_LIMIT = 10;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Проверяет и нормализует вставленную ссылку. Отдельная функция, потому
 * что вызывать её надо ДО ухода в фон: про кривой адрес нужно узнать
 * сразу от формы, а не через минуту из упавшего прогона.
 */
export function parseMdlSearchInput(raw: string): string {
  const value = raw.trim();
  if (!value) throw new Error("Вставьте ссылку на страницу поиска MyDramaList");

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    throw new Error("Не похоже на ссылку — проверьте адрес");
  }
  if (url.hostname !== "mydramalist.com" && url.hostname !== "www.mydramalist.com") {
    throw new Error("Ожидается ссылка на mydramalist.com");
  }
  if (url.pathname.replace(/\/+$/, "") !== "/search") {
    throw new Error(
      "Ожидается ссылка на страницу поиска — mydramalist.com/search?… " +
        "(наберите фильтры на самом MDL и скопируйте адрес из строки браузера)",
    );
  }
  if (!url.search) {
    throw new Error("В ссылке нет фильтров — по пустому поиску импортировать нечего");
  }

  // Номер страницы ставим сами при обходе: свой в ссылке начал бы обход
  // с середины и молча потерял бы всё, что до него.
  url.searchParams.delete("page");
  url.protocol = "https:";
  url.hostname = "mydramalist.com";
  return url.toString();
}

function searchPageUrl(base: string, page: number): string {
  const url = new URL(base);
  if (page > 1) url.searchParams.set("page", String(page));
  return url.toString();
}

type ScanResult = {
  titles: MdlSearchTitle[];
  pagesScanned: number;
  /** Упёрлись в потолок — на MDL, скорее всего, осталось ещё. */
  truncated: boolean;
};

/**
 * Обход пагинации. Сначала собираем весь список и только потом
 * импортируем: так «найдено N» видно в журнале до начала долгой части,
 * и сразу понятно, не оказалась ли ссылка шире, чем задумывалось.
 */
async function scanSearchPages(
  base: string,
  fetcher: MdlRunFetcher,
  opts: { runId?: string | null; onProgress?: (message: string) => void },
): Promise<ScanResult> {
  const titles: MdlSearchTitle[] = [];
  const seen = new Set<string>();
  let pagesScanned = 0;
  let truncated = false;

  for (let page = 1; page <= MAX_PAGES; page++) {
    await checkImportCancelled(opts.runId);
    if (page > 1) await sleep(REQUEST_DELAY_MS);

    let html: string;
    try {
      html = await fetcher.fetchHtml(searchPageUrl(base, page), {
        onWait: (m) => opts.onProgress?.(`Страница ${page}: ${m}`),
      });
    } catch (e) {
      // За последней страницей выдачи MDL отвечает 404 — это конец
      // списка, а не сбой. Всё остальное роняет прогон: молча
      // импортировать половину найденного хуже, чем не импортировать.
      if (e instanceof MdlHttpError && e.status === 404) break;
      throw e;
    }
    pagesScanned = page;

    const found = parseMdlSearchTitles(html);
    const fresh = found.filter((t) => !seen.has(t.path));
    for (const t of fresh) {
      seen.add(t.path);
      titles.push(t);
    }
    opts.onProgress?.(`Просмотрено страниц: ${page}, найдено сериалов: ${titles.length}`);

    // Пусто — выдача кончилась. Не пусто, но всё уже видели — MDL
    // отдал ту же страницу (номер за пределами выдачи), дальше тоже
    // незачем. Неполную страницу концом НЕ считаем: она может быть и
    // признаком того, что пара карточек не разобралась.
    if (found.length === 0 || fresh.length === 0) break;
    if (page === MAX_PAGES) truncated = true;
  }

  return { titles, pagesScanned, truncated };
}

export type MdlSearchImportResult = {
  searchUrl: string;
  pagesScanned: number;
  truncated: boolean;
  found: number;
  created: number;
  updated: number;
  failed: number;
  /** Пропущено нарезок («… Uncut»): не ошибка, а сознательный отказ. */
  skippedVersions: number;
  /** Новых связей «актёр — сериал» и заведённых карточек актёров. */
  castLinked: number;
  performersCreated: number;
  /** Новых связей «сериал — сериал» из Related Content. */
  relationsLinked: number;
  autoUpdate: boolean;
  abortedAfter: string | null;
};

export async function importMdlSearch(
  searchUrl: string,
  opts: {
    runId: string;
    autoUpdate: boolean;
    onProgress?: (message: string) => void;
  },
): Promise<MdlSearchImportResult> {
  // Один загрузчик на весь прогон — и на обход выдачи, и на тайтлы:
  // если Cloudflare закрылся на первой же странице поиска, поднятый
  // браузер дальше обслуживает и все сотни страниц сериалов.
  const fetcher = new MdlRunFetcher({ onNotice: opts.onProgress });
  try {
    const { titles, pagesScanned, truncated } = await scanSearchPages(searchUrl, fetcher, opts);

    let created = 0;
    let updated = 0;
    let failed = 0;
    let skippedVersions = 0;
    let streak = 0;
    let castLinked = 0;
    let performersCreated = 0;
    let relationsLinked = 0;
    let abortedAfter: string | null = null;

    for (const [i, title] of titles.entries()) {
      await checkImportCancelled(opts.runId);
      if (i > 0) await sleep(REQUEST_DELAY_MS);
      opts.onProgress?.(`Импортируем ${i + 1} из ${titles.length}: ${title.title}`);

      try {
        const res = await upsertDramaFromMdl(absMdlUrl(title.path), {
          fetchHtml: fetcher.fetchHtml,
          autoUpdate: opts.autoUpdate,
        });
        if (res.created) created += 1;
        else updated += 1;
        // Связи из Related Content пишет сам upsertDramaFromMdl — здесь
        // только считаем их для сводки. Со временем их становится
        // больше: связь заводится, когда в каталог попал второй конец, а
        // в одном прогоне это сплошь и рядом соседние тайтлы.
        relationsLinked += res.relationsLinked;
        streak = 0;

        // Каст разбирается из той же страницы сериала, которую мы уже
        // скачали, — на MDL за ним никто не ходит. Отбор урезанный
        // (главные роли + знакомый нам второй план): иначе каждый
        // незнакомый актёр второго плана стоил бы отдельной страницы.
        const cast = await linkMdlCast(res.id, res.mdl.cast, {
          runId: opts.runId,
          scope: "main-and-known-support",
          // Заведённым сейчас актёрам — сразу карточку с их страницы.
          enrich: "card",
          fetchHtml: fetcher.fetchHtml,
        });
        castLinked += cast.linked;
        performersCreated += cast.createdPerformers;

        // В ленту «последнего спарсенного» пишем только то, что реально
        // изменилось: повторный прогон по той же ссылке иначе завалил бы
        // её тысячей строк «обновлён», в которых ничего не обновилось.
        if (res.created || res.filled.length > 0 || cast.linked > 0) {
          await prisma.importedItem.create({
            data: {
              runId: opts.runId,
              entityType: "drama",
              entityId: res.id,
              action: res.created ? "created" : "updated",
              label: res.title,
            },
          });
        }
      } catch (e) {
        if (isImportCancelledError(e)) throw e;
        // Нарезка — не сбой: считаем отдельно и не копим серию ошибок,
        // иначе десяток «uncut» подряд оборвал бы прогон по потолку
        // FAILURE_STREAK_LIMIT.
        if (isAlternateVersionError(e)) {
          skippedVersions += 1;
          streak = 0;
          continue;
        }
        failed += 1;
        streak += 1;
        if (streak >= FAILURE_STREAK_LIMIT) {
          abortedAfter = `остановились на ${i + 1}-м после ${FAILURE_STREAK_LIMIT} ошибок подряд: ${
            e instanceof Error ? e.message : String(e)
          }`;
          break;
        }
      }
    }

    return {
      searchUrl,
      pagesScanned,
      truncated,
      found: titles.length,
      created,
      updated,
      failed,
      skippedVersions,
      castLinked,
      performersCreated,
      relationsLinked,
      autoUpdate: opts.autoUpdate,
      abortedAfter,
    };
  } finally {
    // В том числе на остановке кнопкой (ImportCancelledError) и на
    // падении обхода выдачи: незакрытый chromium остался бы висеть.
    await fetcher.close();
  }
}

// ---------- вахта по сохранённым поискам (задача расписания) ----------

/** Ключ SiteSetting со списком отслеживаемых ссылок поиска (по строке
 *  на ссылку). Правится на /admin/schedule во вкладке задачи. */
export const MDL_WATCH_SEARCHES_KEY = "mdl_watch_searches";

/** Сколько страниц выдачи смотрим за прогон одной ссылки. Сортировку
 *  «сначала новые» задаёт сама сохранённая ссылка (`so=newest`) —
 *  новое сверху, и глубже пары страниц ходить незачем: страница, где
 *  встретился знакомый тайтл, становится последней. */
const WATCH_MAX_PAGES = 5;

export type MdlWatchResult = {
  searches: number;
  pagesScanned: number;
  found: number;
  created: number;
  failed: number;
  /** Пропущено нарезок («… Uncut»): не ошибка, а сознательный отказ. */
  skippedVersions: number;
  castLinked: number;
  performersCreated: number;
  /** Названия заведённых — в сводку прогона. */
  newTitles: string[];
  /** Ссылки, чей обход упал (целиком), — с причиной. */
  brokenSearches: string[];
};

/**
 * Ежедневная вахта: не переимпорт всего списка, а проверка «появилось
 * ли новое» (просьба владельца 2026-09-05). По каждой сохранённой
 * ссылке поиска листаем выдачу СВЕРХУ и собираем только тайтлы,
 * которых нет в каталоге (точный матч по mdl-id, как в импорте списка
 * пользователя); страница, где встретился хоть один знакомый тайтл, —
 * последняя: при сортировке «сначала новые» дальше идёт уже
 * импортированное. Найденное заводится обычным путём (upsertDramaFromMdl
 * + урезанный каст) с пометкой «обновлять по расписанию» — новинки
 * обычно ещё выходят, и ночное обновление им нужнее всех.
 */
export async function runMdlWatchSearches(opts: {
  runId: string;
  onProgress?: (message: string) => void;
}): Promise<MdlWatchResult> {
  const { getSetting } = await import("@/lib/siteSettings");
  const raw = (await getSetting(MDL_WATCH_SEARCHES_KEY)) ?? "";
  const searches = raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const result: MdlWatchResult = {
    searches: searches.length,
    pagesScanned: 0,
    found: 0,
    created: 0,
    failed: 0,
    skippedVersions: 0,
    castLinked: 0,
    performersCreated: 0,
    newTitles: [],
    brokenSearches: [],
  };
  if (searches.length === 0) return result;

  // Каталог одним проходом, как в mdlListImport: known-набор mdl-id.
  const { mdlIdFromUrl } = await import("@/lib/mydramalist");
  const catalog = await prisma.drama.findMany({
    where: { OR: [{ mdlUrl: { not: null } }, { mydramalistUrl: { not: null } }] },
    select: { mdlUrl: true, mydramalistUrl: true },
  });
  const knownIds = new Set<string>();
  for (const d of catalog) {
    for (const u of [d.mdlUrl, d.mydramalistUrl]) {
      const id = u ? mdlIdFromUrl(u) : null;
      if (id) knownIds.add(id);
    }
  }

  const fetcher = new MdlRunFetcher({ onNotice: opts.onProgress });
  try {
    for (const rawUrl of searches) {
      await checkImportCancelled(opts.runId);
      let base: string;
      try {
        base = parseMdlSearchInput(rawUrl);
      } catch (e) {
        result.brokenSearches.push(
          `${rawUrl}: ${e instanceof Error ? e.message : String(e)}`,
        );
        continue;
      }

      // Собираем незнакомое с верхних страниц этой ссылки.
      const fresh: MdlSearchTitle[] = [];
      try {
        for (let page = 1; page <= WATCH_MAX_PAGES; page++) {
          await checkImportCancelled(opts.runId);
          if (result.pagesScanned > 0) await sleep(REQUEST_DELAY_MS);
          let html: string;
          try {
            html = await fetcher.fetchHtml(searchPageUrl(base, page));
          } catch (e) {
            if (e instanceof MdlHttpError && e.status === 404) break; // конец выдачи
            throw e;
          }
          result.pagesScanned += 1;
          const titles = parseMdlSearchTitles(html);
          if (titles.length === 0) break;
          let sawKnown = false;
          for (const t of titles) {
            const id = mdlIdFromUrl(t.path);
            if (!id) continue;
            if (knownIds.has(id)) {
              sawKnown = true;
              continue;
            }
            knownIds.add(id); // одна и та же новинка в двух ссылках — один импорт
            fresh.push(t);
          }
          opts.onProgress?.(
            `Проверяем ${base} — страница ${page}, новых пока ${fresh.length}`,
          );
          if (sawKnown) break;
        }
      } catch (e) {
        if (isImportCancelledError(e)) throw e;
        result.brokenSearches.push(
          `${base}: ${e instanceof Error ? e.message : String(e)}`,
        );
        continue;
      }

      result.found += fresh.length;

      for (const title of fresh) {
        await checkImportCancelled(opts.runId);
        await sleep(REQUEST_DELAY_MS);
        opts.onProgress?.(`Заводим новинку: ${title.title}`);
        try {
          const res = await upsertDramaFromMdl(absMdlUrl(title.path), {
            fetchHtml: fetcher.fetchHtml,
            autoUpdate: true,
          });
          if (res.created) {
            result.created += 1;
            result.newTitles.push(res.title);
          }
          const cast = await linkMdlCast(res.id, res.mdl.cast, {
            runId: opts.runId,
            scope: "main-and-known-support",
            enrich: "card",
            fetchHtml: fetcher.fetchHtml,
          });
          result.castLinked += cast.linked;
          result.performersCreated += cast.createdPerformers;
          await prisma.importedItem.create({
            data: {
              runId: opts.runId,
              entityType: "drama",
              entityId: res.id,
              action: res.created ? "created" : "updated",
              label: res.title,
            },
          });
        } catch (e) {
          if (isImportCancelledError(e)) throw e;
          if (isAlternateVersionError(e)) result.skippedVersions += 1;
          else result.failed += 1;
        }
      }
    }
  } finally {
    await fetcher.close();
  }
  return result;
}

/** Сводка вахты для журнала и строки «последний результат». */
export function summarizeMdlWatch(r: MdlWatchResult): string {
  if (r.searches === 0) {
    return "ссылок поиска не задано — добавьте их в настройках задачи";
  }
  return (
    `ссылок ${r.searches}, страниц ${r.pagesScanned}, новых ${r.found}` +
    (r.created ? `, заведено ${r.created}: ${r.newTitles.slice(0, 5).join(", ")}` : "") +
    (r.failed ? `, с ошибкой ${r.failed}` : "") +
    (r.skippedVersions ? `, пропущено нарезок ${r.skippedVersions}` : "") +
    (r.castLinked ? `, каст +${r.castLinked}` : "") +
    (r.performersCreated ? ` (заведено актёров ${r.performersCreated})` : "") +
    (r.brokenSearches.length ? ` · не обошлись: ${r.brokenSearches.join("; ")}` : "")
  );
}

/** Сводка для журнала импортов. Отдельной функцией, потому что нужна и
 *  в `summarize` у logImportRun, и в тексте про потолок. */
export function summarizeMdlSearch(r: MdlSearchImportResult): string {
  return (
    `найдено ${r.found} на ${r.pagesScanned} стр., ` +
    `создано ${r.created}, обновлено ${r.updated}, с ошибкой ${r.failed}` +
    (r.skippedVersions ? `, пропущено нарезок ${r.skippedVersions}` : "") +
    (r.castLinked ? `, каст +${r.castLinked}` : "") +
    (r.performersCreated ? ` (заведено актёров ${r.performersCreated})` : "") +
    (r.relationsLinked ? `, связей между сериалами +${r.relationsLinked}` : "") +
    (r.autoUpdate ? " · помечены «обновлять по расписанию»" : "") +
    (r.truncated
      ? ` · дошли до потолка в ${MAX_PAGES} страниц, на MDL осталось ещё — сузьте фильтры`
      : "") +
    (r.abortedAfter ? ` · ${r.abortedAfter}` : "")
  );
}
