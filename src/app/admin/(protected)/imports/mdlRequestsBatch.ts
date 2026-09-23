import { prisma } from "@/lib/prisma";
import { checkImportCancelled, isImportCancelledError } from "@/lib/importRun";
import { MdlRunFetcher } from "@/lib/mdlClient";
import { isAlternateVersionError, upsertDramaFromMdl } from "@/lib/mdlDramaImport";
import { linkMdlCast } from "@/lib/mdlCastLink";

// Пачка заявок «добавьте сериал» (MdlDramaRequest) ОДНИМ фоновым
// прогоном: одна карточка в журнале, сериалы идут последовательно с
// паузой — MDL чужой сайт, и N параллельных запусков были бы и
// невежливы, и неразличимы в журнале. Файл лежит рядом со страницей
// импортов, а не в mdlDramaImport.ts: пачке нужен linkMdlCast, а тот
// через mdlPerformerImport сам зависит от mdlDramaImport — вышло бы
// кольцо импортов (ровно поэтому mdlCastLink и вынесен отдельно).

/** Та же пауза между сериалами, что у mdl-auto-update и импорта со
 *  страницы поиска: ходим по одной странице, мы в гостях. */
const REQUEST_DELAY_MS = 1500;

/** Подряд упавших сериалов, после которых пачка сдаётся: одна ошибка —
 *  битая ссылка в заявке, десять подряд — нас перестали пускать. */
const FAILURE_STREAK_LIMIT = 10;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type MdlRequestsBatchItem = { mdlUrl: string; title: string };

export type MdlRequestsBatchResult = {
  total: number;
  imported: number;
  failed: number;
  /** Названия неудавшихся: их заявки остались открытыми — резолвит
   *  заявку только успешный upsertDramaFromMdl (хук внутри него). */
  failedTitles: string[];
  /** Заявки на другую нарезку уже известного сериала («… Uncut»): не
   *  ошибка ссылки, а наш сознательный отказ — заявка остаётся
   *  открытой, разбирать её владельцу руками. */
  skippedVersions: string[];
  castLinked: number;
  performersCreated: number;
  /** Прервались раньше времени: MDL перестал отдавать страницы. */
  abortedAfter: string | null;
};

/**
 * Последовательный импорт сериалов по списку заявок.
 *
 * Каждый сериал — обычный `upsertDramaFromMdl`: успех закрывает заявку
 * его же хуком (просившим дописываются статусы, уходят уведомления) —
 * здесь про заявки ничего не написано нарочно, чтобы не дублировать
 * резолв. Ошибка одного сериала НЕ роняет пачку: заявка остаётся
 * открытой, название попадает в «не вышло» итоговой сводки.
 *
 * Каст — урезанным отбором, как у прогона по странице поиска (главные
 * роли + знакомый второй план): пачка — тот же массовый прогон, и брать
 * весь состав на 20 заявках значило бы сотни лишних страниц. Карточки
 * ЗАВЕДЁННЫХ актёров дозаполняются лёгким режимом (`enrich: "card"`) —
 * одна страница на человека, без захода в его фильмографию. Точечная
 * кнопка у заявки по-прежнему делает полный импорт с кастом целиком.
 */
export async function importMdlRequestsBatch(
  requests: MdlRequestsBatchItem[],
  opts: {
    runId: string;
    onProgress?: (message: string) => void;
    /** Тестовый шов: подсунуть страницы без похода на MDL. Без него —
     *  `MdlRunFetcher`, один браузер на весь прогон (как у остальных
     *  массовых прогонов). */
    fetchHtml?: (url: string) => Promise<string>;
    /** Пауза между сериалами; в тестах 0. */
    delayMs?: number;
  },
): Promise<MdlRequestsBatchResult> {
  const delayMs = opts.delayMs ?? REQUEST_DELAY_MS;
  const fetcher = opts.fetchHtml ? null : new MdlRunFetcher({ onNotice: opts.onProgress });
  const fetchHtml = opts.fetchHtml ?? fetcher!.fetchHtml;

  const result: MdlRequestsBatchResult = {
    total: requests.length,
    imported: 0,
    failed: 0,
    failedTitles: [],
    skippedVersions: [],
    castLinked: 0,
    performersCreated: 0,
    abortedAfter: null,
  };
  let streak = 0;

  try {
    for (const [i, req] of requests.entries()) {
      await checkImportCancelled(opts.runId);
      if (i > 0 && delayMs > 0) await sleep(delayMs);
      opts.onProgress?.(`Импортируем ${i + 1} из ${requests.length}: ${req.title}`);

      try {
        const res = await upsertDramaFromMdl(req.mdlUrl, { fetchHtml });
        const cast = await linkMdlCast(res.id, res.mdl.cast, {
          runId: opts.runId,
          scope: "main-and-known-support",
          // Заведённым сейчас актёрам — сразу карточку с их страницы
          // (одна страница на каждого): иначе они оседали бы в каталоге
          // заготовками «имя + ссылка».
          enrich: "card",
          fetchHtml,
        });
        result.imported += 1;
        result.castLinked += cast.linked;
        result.performersCreated += cast.createdPerformers;
        streak = 0;

        // В ленту «последнего спарсенного» — только реально изменившееся
        // (как у импорта со страницы поиска); по этим же записям
        // остановка кнопкой считает «успели импортировать: N».
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
        // Остановка кнопкой — не ошибка сериала: выходим целиком.
        if (isImportCancelledError(e)) throw e;
        // Нарезка — не сбой: серию ошибок не копим, иначе отказы подряд
        // оборвали бы пачку по FAILURE_STREAK_LIMIT.
        if (isAlternateVersionError(e)) {
          result.skippedVersions.push(req.title);
          streak = 0;
          continue;
        }
        result.failed += 1;
        result.failedTitles.push(req.title);
        streak += 1;
        if (streak >= FAILURE_STREAK_LIMIT) {
          result.abortedAfter = `остановились после ${FAILURE_STREAK_LIMIT} ошибок подряд: ${
            e instanceof Error ? e.message : String(e)
          }`;
          break;
        }
      }
    }
  } finally {
    // И на остановке кнопкой: брошенный chromium — память сервера,
    // которая сама не вернётся.
    await fetcher?.close();
  }

  return result;
}

/** Сводка для журнала: «готово X, не вышло Y» — и какие именно не
 *  вышли, чтобы не искать их глазами по списку заявок. */
export function summarizeMdlRequestsBatch(r: MdlRequestsBatchResult): string {
  return (
    `заявок ${r.total}: готово ${r.imported}, не вышло ${r.failed}` +
    (r.failedTitles.length > 0 ? ` (${r.failedTitles.join(", ").slice(0, 200)})` : "") +
    (r.skippedVersions.length > 0
      ? `, нарезки не заводим: ${r.skippedVersions.join(", ").slice(0, 200)}`
      : "") +
    (r.castLinked ? `, каст +${r.castLinked}` : "") +
    (r.performersCreated ? ` (заведено актёров ${r.performersCreated})` : "") +
    (r.abortedAfter ? ` · ${r.abortedAfter}` : "")
  );
}
