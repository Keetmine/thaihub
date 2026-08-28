/**
 * Адрес админ-списка от ТЕКУЩИХ searchParams страницы (И16).
 *
 * Ссылки пагинации раньше собирались в каждой странице заново и
 * перечисляли только «свои» параметры (q, tab, sort…) — всё остальное,
 * в первую очередь параметры панели фильтров (genres, yearFrom,
 * noPoster…), при перелистывании пропадало. Поэтому наоборот: копируем
 * адрес целиком и меняем только то, что просили, — какие бы параметры у
 * страницы ни появились позже, листание их не потеряет.
 */
export function adminListHref(
  basePath: string,
  /** Уже await-нутый `searchParams` серверной страницы. */
  current: Record<string, string | string[] | undefined>,
  /** Что поменять; `null` удаляет параметр (например `{ sort: null }`). */
  patch: Record<string, string | number | null | undefined>,
): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(current)) {
    if (value === undefined) continue;
    // Повторяющийся параметр (?genres=a&genres=b) приходит массивом —
    // append сохраняет каждое значение, set оставил бы последнее.
    if (Array.isArray(value)) for (const v of value) qs.append(key, v);
    else qs.append(key, value);
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined) qs.delete(key);
    else qs.set(key, String(value));
  }
  // Первая страница — это адрес без ?page (см. parsePage), как на
  // публичном /search: не плодим два адреса одной и той же выдачи.
  if (qs.get("page") === "1") qs.delete("page");
  const query = qs.toString();
  return query ? `${basePath}?${query}` : basePath;
}
