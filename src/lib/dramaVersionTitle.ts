/**
 * «Это не сериал, а другая нарезка того же сериала».
 *
 * MyDramaList заводит отдельную страницу на каждую версию монтажа:
 * «Love of Silom (Uncut Ver.)», «Shine (Acoustic Ver.)», «Pit Babe:
 * Uncut», «Match Play: Re-edited Version». Для нас это дубль: та же
 * история, тот же каст, та же дата — только серии длиннее или без
 * цензуры. В каталоге они плодят пары одинаковых карточек, и человек,
 * который ищет сериал, натыкается на две (правка владельца 2026-09-11:
 * «uncut точно все не нужны»).
 *
 * Чистый модуль без базы: правило нужно и импорту (решить, заводить ли
 * запись), и разовым скриптам разбора уже накопленного.
 *
 * ДВА ПРИЗНАКА, а не один. Только по названию судить нельзя: «Love
 * Uncut», «Behind Cut», «Cut» — это настоящие сериалы, у которых слово
 * из словаря просто оказалось в имени. Поэтому:
 *
 * 1. МАРКЕР ЧЕРЕЗ РАЗДЕЛИТЕЛЬ (`:`, скобка, тире) — уверенно:
 *    «Bed Friend: Uncut», «Love of Silom (Uncut Ver.)». Так версию и
 *    оформляют, случайного совпадения тут не бывает.
 * 2. МАРКЕР ЧЕРЕЗ ПРОБЕЛ — только подозрение: «Winter Fever Uncut»,
 *    «Mr. Fanboy Uncut Version». Нужно подтверждение со стороны — что
 *    базовый сериал и правда существует (см. `needsProof`).
 *
 * Подтверждение даёт MDL сам: у страницы-версии в Related Content
 * стоит «… original story» на базовый сериал, а у базового —
 * «… compilation» на версию. У «Love Uncut» и «Behind Cut» связей нет
 * вовсе — проверено на всём каталоге 2026-09-11.
 */

/**
 * Слова, которыми помечают нарезку. Список закрытый и ручной: общее
 * правило «любое слово + Ver./Version» ловило «Call It What You Want
 * (2022 Version)» вместе с «Duang With You Limited Version», но
 * разваливалось на «Lovex3 Uncut Version» (съедало всё название) —
 * а перечислить эти слова оказалось и короче, и честнее.
 *
 * Порядок важен: сначала длинные варианты, иначе «uncut» откусит кусок
 * от «uncut version» и базой станет «… Version».
 */
const MARKERS = [
  "uncut version",
  "uncut ver.",
  "uncut ver",
  "uncut",
  "uncensored version",
  "uncensored",
  "director's cut",
  "director’s cut",
  "directors cut",
  "director cut",
  "re-edited version",
  "re-edit version",
  "reedited version",
  "re-edited",
  "re-edit",
  "acoustic version",
  "acoustic ver.",
  "acoustic ver",
  "vertical version",
  "vertical series",
  "sultrier version",
  "limited version",
  "special version",
  "extended version",
  "extended cut",
  "youtube cut",
];

/** «(2022 Version)» — переснятая версия того же года выпуска. */
const YEAR_VERSION = /^(19|20)\d{2} version$/;

export type DramaVersionMatch = {
  /** Название базового сериала: «Love of Silom» из «Love of Silom (Uncut Ver.)». */
  base: string;
  /** Что именно нашли: «Uncut Ver.», «Director's Cut». */
  marker: string;
  /**
   * true — маркер отделён только пробелом, одного названия мало.
   * Решение принимать лишь при внешнем подтверждении: см.
   * `hasOriginalStoryRelation` или наличие базового сериала в каталоге.
   */
  needsProof: boolean;
};

/** Хвост названия без обрамления: «(Uncut Ver.)» → «uncut ver.». */
function unwrap(tail: string): string {
  return tail.replace(/^[([{]\s*/, "").replace(/\s*[)\]}]$/, "").trim();
}

/**
 * Разбирает название на «базовый сериал + маркер версии».
 * null — обычный сериал.
 */
export function parseDramaVersionTitle(rawTitle: string): DramaVersionMatch | null {
  const title = rawTitle.trim();
  if (!title) return null;

  // Идём по разделителям справа налево: у «Jack & Joker: U Steal My
  // Heart! (Uncut Ver.)» двоеточие есть и в середине названия, важен
  // только последний кусок.
  const separators = [
    { re: /\s*\(([^()]*)\)\s*$/, sep: true },
    { re: /\s*\[([^[\]]*)\]\s*$/, sep: true },
    { re: /\s*:\s*([^:]*)$/, sep: true },
    { re: /\s+[–—-]\s+(.*)$/, sep: true },
    // Просто пробел — последняя попытка и самая слабая.
    { re: /\s+(\S.*)$/, sep: false },
  ];

  for (const { re, sep } of separators) {
    const m = re.exec(title);
    if (!m) continue;
    const tail = unwrap(m[1]);
    const base = title.slice(0, m.index).trim();
    if (!base) continue;

    const lower = tail.toLowerCase();
    const marker = MARKERS.find((x) => x === lower) ?? (YEAR_VERSION.test(lower) ? lower : null);
    if (marker) return { base, marker: tail, needsProof: !sep };

    // Через пробел маркер может состоять из нескольких слов («Uncut
    // Version»), и первая же попытка отрезает только последнее. Идём
    // по всем границам слов справа налево.
    if (!sep) {
      const words = title.split(/\s+/);
      for (let i = words.length - 1; i >= 1; i--) {
        const candidate = words.slice(i).join(" ").toLowerCase();
        if (MARKERS.includes(candidate) || YEAR_VERSION.test(candidate)) {
          return {
            base: words.slice(0, i).join(" "),
            marker: words.slice(i).join(" "),
            needsProof: true,
          };
        }
      }
    }
  }

  return null;
}

/** Связь из Related Content: как её отдаёт разбор страницы MDL. */
export type RelationHint = { relation: string | null; title: string };

/**
 * Есть ли у страницы-версии связь «… original story» на базовый сериал.
 *
 * Это и есть подтверждение для `needsProof`. Название сверяем нестрого:
 * MDL пишет «Mr Fanboy» у базового и «Mr. Fanboy Uncut Version» у
 * версии, «LOVEx3» и «Lovex3» — точки, регистр и знаки гуляют.
 */
export function hasOriginalStoryRelation(base: string, relations: RelationHint[]): boolean {
  const want = looseKey(base);
  if (!want) return false;
  return relations.some(
    (r) => /original story/i.test(r.relation ?? "") && looseKey(r.title) === want,
  );
}

/** Ключ для нестрогого сравнения названий: только буквы и цифры. */
export function looseKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
