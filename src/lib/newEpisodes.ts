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

    const byDrama = new Map<string, NewEpisodeRow>();
    for (const row of rows) {
      // Осиротевшая строка расписания без сериала — пропускаем.
      if (!row.drama || !row.airDate) continue;
      const existing = byDrama.get(row.drama.id);
      if (existing) {
        existing.numbers.push(row.number);
        continue;
      }
      byDrama.set(row.drama.id, {
        ...row.drama,
        numbers: [row.number],
        // Строки идут от свежих к старым, поэтому первая встреченная
        // серия сериала — и есть его последняя за неделю.
        lastAirIso: row.airDate.toISOString(),
      });
    }

    for (const row of byDrama.values()) row.numbers.sort((a, b) => a - b);
    return [...byDrama.values()].slice(0, NEW_EPISODES_LIMIT);
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
