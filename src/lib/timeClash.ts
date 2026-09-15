/**
 * Что с чем пересекается по времени в одном дне.
 *
 * Ради этого кандидаты («возможно пойду») и выводятся в плане поездки, а
 * не отдельным списком: «в один день и одно время два эвента, которые
 * мне интересны, но по факту я выберу только один» (правка владельца
 * 2026-09-15). Голый список кандидатов заставлял бы сверять время
 * глазами — подсказка «в это же время ещё 2» делает выбор видимым.
 *
 * Чистый модуль: считает только по датам, ничего не знает ни о базе, ни
 * о том, что за записи ему дали (событие афиши, личная встреча, дело).
 */

export type ClashItem = {
  key: string;
  startsAt: Date;
  /** Конец, если известен. */
  endsAt?: Date | null;
  /** false — время не назначено (хранится 00:00): запись на весь день. */
  hasTime?: boolean;
};

/**
 * Сколько длится запись без указанного конца. Два часа — обычный
 * концерт или фанмит; выдумывать точнее не из чего, а считать такую
 * запись мгновенной значило бы «19:00 и 19:30 не пересекаются».
 */
const DEFAULT_MINUTES = 120;

/** Календарный день записи — по тем же UTC-компонентам, что и везде
 *  в проекте (даты событий лежат тайским настенным временем). */
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Для каждой записи — сколько ДРУГИХ записей того же дня пересекается с
 * ней по времени.
 *
 * Записи без времени (`hasTime: false`) не участвуют вовсе: «весь день»
 * не конфликтует ни с чем — с ним можно совместить что угодно, и
 * считать его накладкой к каждому вечернему концерту было бы враньём.
 */
export function countClashes(items: ClashItem[]): Map<string, number> {
  const result = new Map<string, number>();
  const timed = items.filter((i) => i.hasTime !== false);
  for (const item of timed) result.set(item.key, 0);

  const byDay = new Map<string, ClashItem[]>();
  for (const item of timed) {
    const key = dayKey(item.startsAt);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(item);
    else byDay.set(key, [item]);
  }

  for (const bucket of byDay.values()) {
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        if (!overlaps(bucket[i], bucket[j])) continue;
        result.set(bucket[i].key, (result.get(bucket[i].key) ?? 0) + 1);
        result.set(bucket[j].key, (result.get(bucket[j].key) ?? 0) + 1);
      }
    }
  }
  return result;
}

function overlaps(a: ClashItem, b: ClashItem): boolean {
  const [aFrom, aTo] = span(a);
  const [bFrom, bTo] = span(b);
  // Стык встык («18:00–20:00» и «20:00–22:00») накладкой не считаем:
  // успеть можно, и подсказка тут только мешала бы.
  return aFrom < bTo && bFrom < aTo;
}

function span(item: ClashItem): [number, number] {
  const from = item.startsAt.getTime();
  const to = item.endsAt ? item.endsAt.getTime() : from + DEFAULT_MINUTES * 60_000;
  // Кривые данные (конец раньше начала) не должны делать отрезок
  // отрицательным — иначе он не пересекался бы даже сам с собой.
  return [from, Math.max(to, from + 1)];
}
