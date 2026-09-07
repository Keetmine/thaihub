/**
 * Сортировка админ-списка — в адресе (`?sort=…`), как фильтры и вкладки
 * (И16): срезом «что я недавно правил» можно поделиться ссылкой и
 * вернуться к нему кнопкой «назад».
 *
 * Вариантов на страницу два-три, и раньше каждый список описывал их сам
 * (`sortByAdded`, `sortByCreated`, свои сборки адреса). Порядок по
 * обновлению нужен во всех каталогах разом, поэтому общий набор:
 * страница перечисляет варианты, а разметку и адреса строит
 * `AdminSortLinks` (`src/components/admin/AdminSortLinks.tsx`).
 */

export type AdminSortOption = {
  /** Значение `?sort`; у варианта по умолчанию — `null`, то есть адрес
   *  без параметра: не плодим два адреса одной и той же выдачи. */
  key: string | null;
  /** Подпись кнопки. Админка одноязычная — строки прямо здесь. */
  label: string;
};

/** `?sort=updated` — «сначала то, что трогали последним». */
export const UPDATED_SORT = "updated";

/**
 * Общий вариант для каталогов с полем `updatedAt`. Подпись одна на все
 * списки: владелец ищет глазами одну и ту же кнопку, переходя из
 * сериалов в локации.
 */
export const updatedSortOption: AdminSortOption = {
  key: UPDATED_SORT,
  label: "по обновлению",
};

/** `orderBy` для выбранного «по обновлению»: свежие правки сверху. */
export const updatedOrderBy = { updatedAt: "desc" } as const;

/**
 * Выбранный вариант из `?sort`. Незнакомое значение (старая ссылка,
 * опечатка) — это вариант по умолчанию, а не пустой список.
 */
export function activeAdminSort(
  raw: string | undefined,
  options: AdminSortOption[],
): string | null {
  return options.find((o) => o.key !== null && o.key === raw)?.key ?? null;
}
