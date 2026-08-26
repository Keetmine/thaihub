import type { DramaStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { downloadRemoteImage } from "@/lib/localImage";
import { checkImportCancelled, isImportCancelledError } from "@/lib/importRun";
import { MdlRunFetcher } from "@/lib/mdlClient";
import {
  canonicalMdlUrl,
  fetchMdlDrama,
  fetchMdlEpisodes,
  mdlEpisodesUrl,
  mdlIdFromUrl,
  parseMdlDramaPage,
  parseMdlEpisodes,
  type MdlDrama,
  type MdlEpisode,
  type MdlRelatedEntry,
} from "@/lib/mydramalist";

/** Что стало с расписанием серий за этот импорт. */
export type MdlScheduleSync = {
  /** Серий в расписании после синхронизации. */
  total: number;
  added: number;
  /** Уточнились дата или название уже известной серии. */
  changed: number;
  /** Серий, которых на MDL больше нет. */
  removed: number;
};

export type MdlDramaUpsert = {
  id: string;
  title: string;
  created: boolean;
  /** Какие поля дозаполнили у уже существующей записи. */
  filled: string[];
  /** Разобранная страница — вызывающий решает, что делать с кастом. */
  mdl: MdlDrama;
  /** null — за расписанием не ходили или страница не разобралась. */
  schedule: MdlScheduleSync | null;
  /** Сколько новых связей из Related Content завелось за этот импорт. */
  relationsLinked: number;
};

export type MdlDramaUpsertOptions = {
  /** Чем брать html страницы. Массовый прогон передаёт сюда свой
   *  `MdlRunFetcher.fetchHtml` — один браузер на весь прогон вместо
   *  chromium на каждую недоступную страницу. Не передан — одиночный
   *  путь: обычный GET, при челлендже свой браузер на эту страницу. */
  fetchHtml?: (url: string) => Promise<string>;
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
/**
 * Какой сериал в каталоге соответствует странице MDL.
 *
 * Числовой id из адреса — единственный надёжный признак: он у страницы
 * один и навсегда. Всё остальное — догадка, и цена ошибки высокая:
 * совпадение перезаписывает поля ЧУЖОЙ записи, причём молча.
 *
 * Поэтому запасной путь по названию требует ещё и совпадения года и
 * обязан быть однозначным. Названия у сериалов повторяются постоянно
 * (римейки, продолжения, просто совпадения): «Restart» 2026 года
 * подтянулся к «Restart» 2021-го и обновил его — с этого и начали
 * чинить. Нет года на странице, нет года в записи, нашлось больше
 * одного кандидата — не угадываем, а заводим новый сериал. Лишний
 * дубль виден в /admin/duplicates и склеивается одной кнопкой, а
 * затёртая чужая карточка не восстанавливается ничем.
 */
async function findDramaForMdlPage(sourceUrl: string, title: string, year: number | null) {
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

  if (year === null) return null;
  const candidates = await prisma.drama.findMany({ where: { title, year }, take: 2 });
  return candidates.length === 1 ? candidates[0] : null;
}

// ---------- связанные сериалы ----------

/**
 * Пишет блок Related Content страницы в `DramaRelation`.
 *
 * Связываем ТОЛЬКО с тем, что уже есть в каталоге: сходить на MDL за
 * отсутствующим — это лишняя страница чужого сайта на каждую связь, а в
 * массовом прогоне их сотни. Не нашли — молча пропускаем: связь заведётся
 * сама, когда второй сериал импортируют (его страница ссылается на этот
 * же в обратную сторону, и наоборот).
 *
 * Соответствие ищет общий `findDramaForMdlPage`, но года у связи нет:
 * в Related Content MDL печатает только название и подпись отношения.
 * Значит, срабатывает лишь надёжная ветка — по числовому id из адреса.
 * Это и правильно: догадка по одному названию здесь особенно опасна, в
 * одном блоке рядом стоят две РАЗНЫЕ «Raeng Hueng» с разными id.
 *
 * Связь направленная: пишем сторону «этот сериал → связанный» с подписью
 * MDL («Thai sequel», «Korean prequel»). Обратную сторону не заводим —
 * страница сериала читает обе (`relatedFrom` + `relatedTo`) и показывает
 * пару один раз.
 */
async function syncDramaRelations(dramaId: string, related: MdlRelatedEntry[]): Promise<number> {
  if (related.length === 0) return 0;

  const rows = await prisma.dramaRelation.findMany({
    where: { dramaId },
    select: { relatedId: true, relation: true },
  });
  const known = new Map(rows.map((r) => [r.relatedId, r.relation]));

  let added = 0;
  const seen = new Set<string>();
  for (const entry of related) {
    const match = await findDramaForMdlPage(canonicalMdlUrl(entry.url), entry.title, null);
    if (!match || match.id === dramaId) continue;
    // Две записи блока могут указать на один наш сериал (дубли в
    // каталоге) — второй create упал бы на уникальном ключе.
    if (seen.has(match.id)) continue;
    seen.add(match.id);

    if (!known.has(match.id)) {
      await prisma.dramaRelation.create({
        data: { dramaId, relatedId: match.id, relation: entry.relation },
      });
      added += 1;
      continue;
    }
    // Сама связь уже есть — повторный импорт её не дублирует; подпись
    // на MDL иногда уточняют, её освежаем.
    if (known.get(match.id) !== entry.relation) {
      await prisma.dramaRelation.update({
        where: { dramaId_relatedId: { dramaId, relatedId: match.id } },
        data: { relation: entry.relation },
      });
    }
  }
  return added;
}

// ---------- расписание серий ----------

/**
 * Идти ли на подстраницу `/episodes`.
 *
 * Расписание — это ВТОРОЙ поход на MDL на каждый сериал, а массовый
 * прогон обходит сотни тайтлов: без отбора мы бы ровно вдвое увеличили
 * нагрузку на чужой сайт и время прогона. Правило:
 *
 * - расписания у сериала ещё нет — берём один раз, каким бы ни был
 *   статус: у завершённого оно больше не изменится, значит и второго
 *   раза не понадобится;
 * - дальше возвращаемся только к тем, у кого оно ещё меняется:
 *   «выходит» и «запланирован» (у анонса даты как раз и появляются
 *   неделя за неделей), плюс «статус неизвестен» — он выводится из дат
 *   эфира, и пустой статус означает, что дат на карточке нет, то есть
 *   расписание тем более может быть свежее нашего;
 * - у завершённого с уже забранным расписанием на страницу не ходим.
 *
 * Статус берём разобранный со страницы, а не из базы: он только что
 * посчитан по свежим датам эфира.
 */
async function shouldSyncSchedule(
  existingId: string | null,
  status: DramaStatus | null,
): Promise<boolean> {
  if (!existingId) return true;
  if (status === null || status === "RETURNING_SERIES" || status === "PLANNED") return true;
  return (await prisma.dramaEpisode.count({ where: { dramaId: existingId } })) === 0;
}

/** Страница расписания: массовый прогон — своим загрузчиком (один
 *  браузер на прогон), одиночный импорт — общим fetchMdlEpisodes. */
async function fetchSchedule(
  sourceUrl: string,
  opts: MdlDramaUpsertOptions,
): Promise<MdlEpisode[] | null> {
  try {
    return opts.fetchHtml
      ? parseMdlEpisodes(await opts.fetchHtml(mdlEpisodesUrl(sourceUrl)))
      : await fetchMdlEpisodes(sourceUrl);
  } catch (e) {
    if (isImportCancelledError(e)) throw e;
    // Карточка сериала к этому моменту уже разобрана — ронять из-за
    // расписания весь импорт незачем: у фильмов подстраницы
    // `/episodes` нет вовсе (404), а отказ MDL на ней ничего не говорит
    // о самой карточке.
    return null;
  }
}

/**
 * Приводит `DramaEpisode` сериала к тому, что показал MDL.
 *
 * Пустой список НЕ применяем: «серий не нашли» — это почти всегда не
 * отмена показа, а урезанная страница или разъехавшаяся вёрстка, и
 * стереть по такому поводу всё расписание хуже, чем не обновить его.
 */
async function syncDramaEpisodes(
  dramaId: string,
  parsed: MdlEpisode[],
): Promise<MdlScheduleSync | null> {
  if (parsed.length === 0) return null;

  const existing = await prisma.dramaEpisode.findMany({
    where: { dramaId },
    select: { number: true, airDate: true, title: true },
  });
  const byNumber = new Map(existing.map((e) => [e.number, e]));

  const toCreate: { dramaId: string; number: number; airDate: Date | null; title: string | null }[] =
    [];
  const toUpdate: { number: number; airDate: Date | null; title: string | null }[] = [];

  for (const ep of parsed) {
    const current = byNumber.get(ep.number);
    // Известную дату НЕ затираем в null. Если она у нас есть, а MDL её
    // сейчас не показал, это чаще сбой разбора (или временно урезанная
    // страница), чем снятая с эфира серия: даты у выходящих переносят,
    // но не «разобъявляют». То же и с названием.
    const airDate = ep.airDate ?? current?.airDate ?? null;
    const title = ep.title ?? current?.title ?? null;

    if (!current) {
      toCreate.push({ dramaId, number: ep.number, airDate, title });
      continue;
    }
    if (current.airDate?.getTime() !== airDate?.getTime() || current.title !== title) {
      toUpdate.push({ number: ep.number, airDate, title });
    }
  }

  // Первый импорт длинного сериала — это сотни строк: заводим их одним
  // запросом, а не по одной.
  if (toCreate.length > 0) {
    await prisma.dramaEpisode.createMany({ data: toCreate, skipDuplicates: true });
  }
  for (const row of toUpdate) {
    await prisma.dramaEpisode.update({
      where: { dramaId_number: { dramaId, number: row.number } },
      data: { airDate: row.airDate, title: row.title },
    });
  }
  // Серия исчезла с MDL (перенумеровали, свели спецвыпуск с обычной) —
  // убираем: расписание должно совпадать с источником.
  const removed = await prisma.dramaEpisode.deleteMany({
    where: { dramaId, number: { notIn: parsed.map((e) => e.number) } },
  });

  return {
    total: parsed.length,
    added: toCreate.length,
    changed: toUpdate.length,
    removed: removed.count,
  };
}

/** Короткая строка про расписание для сводки прогона. */
export function summarizeSchedule(s: MdlScheduleSync | null): string {
  if (!s) return "";
  const parts = [
    s.added ? `+${s.added}` : "",
    s.changed ? `уточнено ${s.changed}` : "",
    s.removed ? `убрано ${s.removed}` : "",
  ].filter(Boolean);
  return parts.length > 0 ? `, расписание серий: ${parts.join(", ")} (всего ${s.total})` : "";
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
 *
 * Блок Related Content пишется всегда и всеми путями импорта (см.
 * `syncDramaRelations`): лишних запросов к MDL он не стоит — связи уже
 * разобраны из той же страницы.
 */
export async function upsertDramaFromMdl(
  url: string,
  opts: MdlDramaUpsertOptions = {},
): Promise<MdlDramaUpsert> {
  // Приводим адрес к каноническому виду ДО запроса: `Drama.mdlUrl`
  // уникально, и «…/12345-x/» с «www.…/12345-x?ref=search» не должны
  // стать двумя разными сериалами.
  const sourceUrl = canonicalMdlUrl(url);
  const mdl = opts.fetchHtml
    ? parseMdlDramaPage(await opts.fetchHtml(sourceUrl), sourceUrl)
    : await fetchMdlDrama(sourceUrl);
  const existing = await findDramaForMdlPage(sourceUrl, mdl.title, mdl.year);

  const parsedSchedule = (await shouldSyncSchedule(existing?.id ?? null, mdl.status))
    ? await fetchSchedule(sourceUrl, opts)
    : null;
  // Число серий берём из расписания: это перечисление реальных серий, а
  // «Episodes: N» в блоке Details у выходящих отстаёт (и у нас оно ещё
  // могло остаться от старых TMDB-импортов). Пустое расписание в счёт не
  // идёт — см. syncDramaEpisodes.
  const scheduleCount = parsedSchedule && parsedSchedule.length > 0 ? parsedSchedule.length : null;

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
    tags: mdl.tags,
    director: mdl.director,
    screenwriter: mdl.screenwriter,
    network: mdl.network,
    episodes: scheduleCount ?? mdl.episodes,
    airedFrom: mdl.airedFrom,
    airedTo: mdl.airedTo,
    airedOn: mdl.airedOn,
    duration: mdl.duration,
    contentRating: mdl.contentRating,
    country: mdl.country,
    type: mdl.type,
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
    return {
      id: created.id,
      title: created.title,
      created: true,
      filled: [],
      mdl,
      schedule: parsedSchedule ? await syncDramaEpisodes(created.id, parsedSchedule) : null,
      relationsLinked: await syncDramaRelations(created.id, mdl.related),
    };
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
  fill("tags", "теги");
  fill("director", "режиссёр");
  fill("screenwriter", "сценарист");
  fill("network", "канал");
  fill("episodes", "серии");
  fill("airedFrom", "начало эфира");
  fill("airedTo", "конец эфира");
  fill("airedOn", "день выхода");
  fill("duration", "длительность");
  fill("contentRating", "возрастной рейтинг");
  fill("country", "страна");
  fill("type", "тип");
  fill("year", "год");
  // Статус выводится из дат эфира — освежаем всегда.
  if (mdl.status && mdl.status !== existing.status) {
    data.status = mdl.status;
    filled.push("статус");
  }
  // Расписание против «Episodes: N»: если разошлись, верим расписанию —
  // даже поверх занесённого руками, иначе на карточке было бы «12
  // серий», а в списке под ней 13.
  if (scheduleCount !== null && scheduleCount !== existing.episodes) {
    data.episodes = scheduleCount;
    if (!filled.includes("серии")) filled.push("серии");
  }

  const updated = await prisma.drama.update({ where: { id: existing.id }, data });
  const schedule = parsedSchedule ? await syncDramaEpisodes(updated.id, parsedSchedule) : null;
  // В `filled` — чтобы прогон посчитал такой сериал изменившимся: ради
  // уточнённых дат ночное обновление и ходит.
  if (schedule && (schedule.added || schedule.changed || schedule.removed)) {
    filled.push("расписание серий");
  }
  // Связь появляется не только на первом импорте: у давнего сериала она
  // заводится в тот прогон, когда в каталог попал второй её конец.
  const relationsLinked = await syncDramaRelations(updated.id, mdl.related);
  if (relationsLinked > 0) filled.push("связанные сериалы");

  return {
    id: updated.id,
    title: updated.title,
    created: false,
    filled,
    mdl,
    schedule,
    relationsLinked,
  };
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
  /** У скольких сериалов поменялось расписание серий. */
  scheduleChanged: number;
  /** Сколько серий за прогон добавилось и сколько уточнило дату. */
  episodesAdded: number;
  episodesChanged: number;
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
 * Расписание серий обновляется тем же вызовом `upsertDramaFromMdl` —
 * ради него ночной обход в основном и нужен: у выходящего сериала даты
 * следующих серий уточняются неделями. Лишней страницы это не стоит
 * там, где расписание уже не изменится (см. `shouldSyncSchedule`).
 *
 * Страницы берём через `MdlRunFetcher`: обычным fetch'ем, а если MDL
 * закрылся Cloudflare-проверкой — ОДНИМ браузером на весь прогон.
 * Раньше здесь браузера не было вовсе, и ночь, в которую MDL включал
 * проверку, целиком уходила в отказы.
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
  let scheduleChanged = 0;
  let episodesAdded = 0;
  let episodesChanged = 0;
  let abortedAfter: string | null = null;

  const fetcher = new MdlRunFetcher({ onNotice: opts.onProgress });
  try {
    for (const [i, drama] of dramas.entries()) {
      await checkImportCancelled(opts.runId);
      if (i > 0) await sleep(AUTO_UPDATE_DELAY_MS);
      opts.onProgress?.(`Обновляем ${i + 1} из ${dramas.length}: ${drama.title}`);
      checked += 1;

      try {
        const res = await upsertDramaFromMdl(drama.mdlUrl!, { fetchHtml: fetcher.fetchHtml });
        if (res.filled.length > 0) updated += 1;
        if (res.schedule && (res.schedule.added || res.schedule.changed || res.schedule.removed)) {
          scheduleChanged += 1;
          episodesAdded += res.schedule.added;
          episodesChanged += res.schedule.changed;
        }
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
  } finally {
    // В том числе на остановке кнопкой (ImportCancelledError): брошенный
    // chromium — это память сервера, которая не вернётся.
    await fetcher.close();
  }

  return {
    checked,
    updated,
    failed,
    scheduleChanged,
    episodesAdded,
    episodesChanged,
    pending: Math.max(0, total - checked),
    abortedAfter,
  };
}
