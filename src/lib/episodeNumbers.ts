/**
 * Номера серий одной подписью: «5», «5–6», «5–7», «5, 8».
 *
 * Нужно там, где в один день выходит СРАЗУ НЕСКОЛЬКО серий — у тайских
 * сериалов это норма (двойные премьеры по пятницам и субботам).
 * Плашка под постером говорила «5 серия сегодня», хотя сегодня выходят
 * пятая и шестая (замечено владельцем 2026-09-11 на «The Last Oath»).
 *
 * Чистый модуль без базы и без языка: сами номера от локали не зависят,
 * а слово «серия/серии» подставляет словарь (см. `nextEpisodeTitle` в
 * src/lib/i18n/{ru,en}/catalog.ts).
 *
 * Подряд идущие сжимаются в диапазон через ТИРЕ (U+2013), а не дефис:
 * это числовой промежуток. Разрывы перечисляются через запятую — такое
 * бывает у сериалов с досъёмками, где 16-я и 18-я вышли в один день, а
 * 17-я неделей раньше.
 */
export function formatEpisodeNumbers(numbers: number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  if (sorted.length === 0) return "";

  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  const flush = () => parts.push(start === prev ? `${start}` : `${start}–${prev}`);

  for (const n of sorted.slice(1)) {
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    flush();
    start = n;
    prev = n;
  }
  flush();
  return parts.join(", ");
}
