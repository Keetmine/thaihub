/**
 * «Новые серии» — витринный блок каталога (решение владельца
 * 2026-09-16): сериалы, у которых на этой неделе вышла серия.
 *
 * Зачем он вообще. Каталог открывался на «Смотрю сейчас», и у девяти
 * человек из тринадцати там было пусто: новичок первым делом видел
 * пустую страницу. Серий при этом выходит около 75 в неделю —
 * показывать есть что, и гостю в том числе.
 *
 * Границы суток берутся startOfDay/endOfDay, как на главной: даты эфира
 * лежат тайским настенным временем, и сравнение с моментом `now` под
 * утро отдавало бы вчерашний день.
 *
 * Отдельного фильтра «онгоинги» не нужно: расписание ведётся только у
 * выходящих сериалов, у завершённого свежих дат не бывает.
 */
import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";
import { CATALOG_TAG } from "@/lib/catalogCache";
import { startOfDay, endOfDay, addDays } from "@/lib/dates";

/** Окно недели: сегодня и шесть дней до него. */
export const NEW_EPISODES_DAYS = 7;

/** Сколько сериалов показываем в блоке. */
export const NEW_EPISODES_LIMIT = 12;

export type NewEpisodeRow = {
  id: string;
  slug: string | null;
  title: string;
  titleRu: string | null;
  posterUrl: string | null;
  year: number | null;
  episodes: number | null;
  /** Номера серий, вышедших в окне, по возрастанию. */
  numbers: number[];
  /** Дата самой свежей из них (ISO — значение переживает кэш). */
  lastAirIso: string;
};

/** Строки расписания → по сериалу на карточку: у одного сериала в один
 *  день часто выходит сразу две серии (двойные премьеры по пятницам и
 *  субботам — норма), и двумя плитками это показывать незачем. */
function groupByDrama(
  rows: {
    number: number;
    airDate: Date | null;
    drama: Omit<NewEpisodeRow, "numbers" | "lastAirIso"> | null;
  }[],
): NewEpisodeRow[] {
  const byDrama = new Map<string, NewEpisodeRow>();
  for (const row of rows) {
    // Осиротевшая строка расписания без сериала — пропускаем.
    if (!row.drama || !row.airDate) continue;
    const existing = byDrama.get(row.drama.id);
    if (existing) {
      existing.numbers.push(row.number);
      // Держим САМУЮ ПОЗДНЮЮ дату сериала: порядок строк у разных
      // выборок разный, и полагаться на «первая встреченная» нельзя.
      if (row.airDate.toISOString() > existing.lastAirIso) {
        existing.lastAirIso = row.airDate.toISOString();
      }
      continue;
    }
    byDrama.set(row.drama.id, {
      ...row.drama,
      numbers: [row.number],
      lastAirIso: row.airDate.toISOString(),
    });
  }
  for (const row of byDrama.values()) row.numbers.sort((a, b) => a - b);
  return [...byDrama.values()];
}

/**
 * Сериалы с вышедшими за неделю сериями, свежие сверху.
 *
 * Запрос идёт по эпизодам, а не по сериалам: индекс есть именно на
 * `DramaEpisode.airDate` (заведён под «выходит сегодня» на главной), и
 * строк в недельном окне десятки, а не тысячи. Группировка по сериалу —
 * в памяти: у одного сериала за неделю обычно две серии, и второй
 * запрос ради этого не нужен.
 *
 * Сюда намеренно НЕ передаётся раздел каталога: расписание ведётся
 * только у сериалов, у фильма серий не бывает. Блок один на все
 * разделы и стоит над переключателем.
 */
const load = unstable_cache(
  async (fromIso: string, toIso: string): Promise<NewEpisodeRow[]> => {
    const rows = await prisma.dramaEpisode.findMany({
      where: { airDate: { gte: new Date(fromIso), lte: new Date(toIso) } },
      select: {
        number: true,
        airDate: true,
        drama: {
          select: {
            id: true,
            slug: true,
            title: true,
            titleRu: true,
            posterUrl: true,
            year: true,
            episodes: true,
          },
        },
      },
      orderBy: { airDate: "desc" },
    });

    return groupByDrama(rows).slice(0, NEW_EPISODES_LIMIT);
  },
  ["catalog-new-episodes-v1"],
  { revalidate: 1800, tags: [CATALOG_TAG] },
);

/** Обёртка: считает окно от «сейчас» и зовёт кэш. День входит в ключ,
 *  поэтому смена суток заводит свежую запись сама. */
export function getNewEpisodes(now = new Date()): Promise<NewEpisodeRow[]> {
  return load(
    startOfDay(addDays(now, -(NEW_EPISODES_DAYS - 1))).toISOString(),
    endOfDay(now).toISOString(),
  );
}

/* ------------------------------------------------------------------
 * Листалка по дням (правка владельца 2026-09-16)
 *
 * «Как календарь: выводились бы сегодня, потом кнопочкой вперёд или
 * назад — вчера и завтра, или открыть календарь и выбрать день».
 * Неделя одной кучей отвечала на вопрос «что вышло вообще», а не «что
 * вышло в такой-то день», и завтрашние серии в неё не попадали вовсе.
 *
 * День живёт в адресе (`?day=2026-09-16`), а не в состоянии: срез можно
 * переслать и положить в закладки, а стрелки остаются обычными
 * ссылками и работают без JS.
 * ------------------------------------------------------------------ */

/** Серии одного дня. Границы — те же startOfDay/endOfDay: даты эфира
 *  лежат тайским настенным временем. */
const loadDay = unstable_cache(
  async (dayIso: string): Promise<NewEpisodeRow[]> => {
    const day = new Date(dayIso);
    const rows = await prisma.dramaEpisode.findMany({
      where: { airDate: { gte: startOfDay(day), lte: endOfDay(day) } },
      select: {
        number: true,
        airDate: true,
        drama: {
          select: {
            id: true,
            slug: true,
            title: true,
            titleRu: true,
            posterUrl: true,
            year: true,
            episodes: true,
          },
        },
      },
      orderBy: { number: "asc" },
    });
    return groupByDrama(rows);
  },
  ["catalog-episodes-of-day-v1"],
  { revalidate: 1800, tags: [CATALOG_TAG] },
);

/** Серии выбранного дня. День входит в ключ кэша, поэтому смена суток
 *  заводит свежую запись сама. */
export function getEpisodesOfDay(day: Date): Promise<NewEpisodeRow[]> {
  return loadDay(startOfDay(day).toISOString());
}

/**
 * Ближайший день с сериями — от `from` в сторону `dir`, не дальше
 * `MAX_JUMP_DAYS`.
 *
 * Зачем: стрелка «дальше» на пустой день ведёт в пустой день, и в
 * межсезонье человек кликает её пять раз подряд впустую. Стрелка
 * прыгает сразу на день, где что-то есть, а если впереди пусто —
 * прячется. Предел нужен, чтобы запрос не уходил в бесконечность на
 * краю расписания.
 */
export const MAX_JUMP_DAYS = 400;

export async function findNeighbourDay(
  from: Date,
  dir: 1 | -1,
): Promise<Date | null> {
  const edge = addDays(from, dir * MAX_JUMP_DAYS);
  const row = await prisma.dramaEpisode.findFirst({
    where:
      dir === 1
        ? { airDate: { gt: endOfDay(from), lte: endOfDay(edge) } }
        : { airDate: { lt: startOfDay(from), gte: startOfDay(edge) } },
    select: { airDate: true },
    orderBy: { airDate: dir === 1 ? "asc" : "desc" },
  });
  return row?.airDate ?? null;
}
