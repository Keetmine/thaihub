import { prisma } from "@/lib/prisma";
import { downloadRemoteImage } from "@/lib/localImage";
import { checkImportCancelled, isImportCancelledError } from "@/lib/importRun";
import {
  canonicalMdlUrl,
  fetchMdlDrama,
  mdlIdFromUrl,
  type MdlDrama,
} from "@/lib/mydramalist";

export type MdlDramaUpsert = {
  id: string;
  title: string;
  created: boolean;
  /** Какие поля дозаполнили у уже существующей записи. */
  filled: string[];
  /** Разобранная страница — вызывающий решает, что делать с кастом. */
  mdl: MdlDrama;
};

export type MdlDramaUpsertOptions = {
  /** Открывать ли страницу настоящим браузером, если обычный GET не
   *  прошёл. Для одиночного импорта — да; для списочного нет: сотни
   *  запусков chromium растянули бы прогон на часы. */
  browserFallback?: boolean;
  /** Поставить «обновлять по расписанию» (`Drama.mdlAutoUpdate`). Флаг
   *  только ставится и никогда не снимается: иначе обычный повторный
   *  импорт молча выключал бы автообновление, включённое второй
   *  кнопкой. */
  autoUpdate?: boolean;
};

/**
 * Ищет сериал, которому принадлежит страница MDL.
 *
 * Двумя запросами, а не одним OR: совпадение по странице точное, а по
 * названию — догадка, и в общем `findFirst` с OR они равноправны, то
 * есть чужой одноимённый сериал мог перебить верный матч по ссылке.
 *
 * По ссылке сверяем числовой id, а не строку целиком: слаг в адресе MDL
 * со временем меняется («/12345-love» → «/12345-love-in-the-air»), id —
 * нет.
 */
async function findDramaForMdlPage(sourceUrl: string, title: string) {
  const mdlId = mdlIdFromUrl(sourceUrl);
  if (mdlId) {
    const byPage = await prisma.drama.findFirst({
      where: {
        OR: [
          { mdlUrl: { contains: `/${mdlId}-` } },
          { mydramalistUrl: { contains: `/${mdlId}-` } },
        ],
      },
    });
    if (byPage) return byPage;
  }
  return prisma.drama.findFirst({ where: { title } });
}

/**
 * Создаёт или дозаполняет сериал по странице MyDramaList.
 *
 * Каст здесь НЕ трогаем намеренно: этим же кодом пользуется импорт
 * фильмографии актёра и импорт со страницы поиска, и если бы новый
 * сериал тянул за собой свой состав, а каждый актёр — свою
 * фильмографию, один импорт уходил бы в бесконечную цепочку по половине
 * каталога MDL. Кто хочет каст — разбирает `mdl.cast` сам (так делает
 * импорт сериала из /admin/imports).
 *
 * Занесённое руками не переписываем: у существующей записи заполняются
 * только пустые поля. Исключение — статус: он выводится из дат эфира и
 * освежается всегда.
 */
export async function upsertDramaFromMdl(
  url: string,
  opts: MdlDramaUpsertOptions = {},
): Promise<MdlDramaUpsert> {
  // Приводим адрес к каноническому виду ДО запроса: `Drama.mdlUrl`
  // уникально, и «…/12345-x/» с «www.…/12345-x?ref=search» не должны
  // стать двумя разными сериалами.
  const sourceUrl = canonicalMdlUrl(url);
  const mdl = await fetchMdlDrama(sourceUrl, { browserFallback: opts.browserFallback });
  const existing = await findDramaForMdlPage(sourceUrl, mdl.title);

  const poster = mdl.posterUrl ? await downloadRemoteImage(mdl.posterUrl, "mdl") : null;
  const base = {
    // Две ссылки на одну страницу — намеренно: mydramalistUrl правится
    // руками в форме сериала и питает атрибуцию «MyDramaList ↗» на
    // публичной странице, а mdlUrl хранит канонический адрес и служит
    // ключом дедупликации и переимпорта (как blsceneUrl и tmdbId).
    mydramalistUrl: sourceUrl,
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
      data: {
        title: mdl.title,
        ...base,
        mdlUrl: sourceUrl,
        mdlAutoUpdate: opts.autoUpdate ?? false,
      },
    });
    return { id: created.id, title: created.title, created: true, filled: [], mdl };
  }

  const data: Record<string, unknown> = {
    mydramalistUrl: sourceUrl,
    mdlUrl: sourceUrl,
    mdlScore: mdl.rating,
    mdlSyncedAt: new Date(),
  };
  // Флаг только включаем: снимать его должен человек, а не очередной
  // импорт без второй кнопки.
  if (opts.autoUpdate) data.mdlAutoUpdate = true;

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
  return { id: updated.id, title: updated.title, created: false, filled, mdl };
}

// ---------- обновление по расписанию ----------

/** Сколько сериалов трогаем за одну ночь. Порядок обхода — «кого дольше
 *  всех не открывали», так что потолок не теряет записи, а растягивает
 *  большой список на несколько ночей. */
const AUTO_UPDATE_LIMIT = 300;

/** Пауза между страницами: MDL — чужой сайт, ходим по одной. */
const AUTO_UPDATE_DELAY_MS = 1500;

/** Подряд упавших страниц, после которых прогон сдаётся: одна ошибка —
 *  это удалённый тайтл, а десять подряд означают, что нас перестали
 *  пускать, и дальше идти по списку бессмысленно. */
const FAILURE_STREAK_LIMIT = 10;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type MdlAutoUpdateResult = {
  checked: number;
  updated: number;
  failed: number;
  /** Осталось за потолком прогона — доберём в следующую ночь. */
  pending: number;
  /** Прервались раньше времени: MDL перестал отдавать страницы. */
  abortedAfter: string | null;
};

/**
 * Ночной обход сериалов с галочкой «обновлять по расписанию».
 *
 * Смысл флага: у выходящих сейчас тайтлов постоянно меняются даты
 * эфира, число серий, статус и оценка, а у завершённых — уже нет.
 * Поэтому обходим не «всё, у чего есть ссылка на MDL» (это тысячи
 * записей), а только помеченное.
 *
 * Браузер не поднимаем (`browserFallback: false`): прогон фоновый, и
 * сотня chromium'ов вместо сотни отказов — худшее, что он может
 * сделать ночью.
 */
export async function refreshMdlAutoUpdateDramas(opts: {
  runId?: string | null;
  onProgress?: (message: string) => void;
}): Promise<MdlAutoUpdateResult> {
  const where = { mdlAutoUpdate: true, mdlUrl: { not: null } };
  const total = await prisma.drama.count({ where });
  const dramas = await prisma.drama.findMany({
    where,
    select: { id: true, title: true, mdlUrl: true },
    // Кого дольше всех не открывали — вперёд; ни разу не открывавшиеся
    // (mdlSyncedAt пуст) идут самыми первыми.
    orderBy: { mdlSyncedAt: { sort: "asc", nulls: "first" } },
    take: AUTO_UPDATE_LIMIT,
  });

  let checked = 0;
  let updated = 0;
  let failed = 0;
  let streak = 0;
  let abortedAfter: string | null = null;

  for (const [i, drama] of dramas.entries()) {
    await checkImportCancelled(opts.runId);
    if (i > 0) await sleep(AUTO_UPDATE_DELAY_MS);
    opts.onProgress?.(`Обновляем ${i + 1} из ${dramas.length}: ${drama.title}`);
    checked += 1;

    try {
      const res = await upsertDramaFromMdl(drama.mdlUrl!, { browserFallback: false });
      if (res.filled.length > 0) updated += 1;
      streak = 0;
    } catch (e) {
      if (isImportCancelledError(e)) throw e;
      failed += 1;
      streak += 1;
      if (streak >= FAILURE_STREAK_LIMIT) {
        abortedAfter = `остановились после ${FAILURE_STREAK_LIMIT} ошибок подряд: ${
          e instanceof Error ? e.message : String(e)
        }`;
        break;
      }
    }
  }

  return { checked, updated, failed, pending: Math.max(0, total - checked), abortedAfter };
}
