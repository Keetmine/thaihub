/**
 * Свои блоки ссылок у артиста (правка владельца 2026-09-15).
 *
 * «Как бренды, только чтобы можно было задавать и заголовок блоку»:
 * блок «Питомцы» с инстаграмами кота и собаки, блок «Кафе» с заведением
 * артиста. Заголовок задаёт владелец в админке — `PerformerLink.group`.
 *
 * Чистый модуль без базы: одно и то же нужно и странице артиста
 * (собрать блоки), и форме админки (разложить обратно по строкам).
 */

/** Минимум, по которому собирается блок. */
export type GroupedLink = {
  id?: string;
  label: string;
  url: string;
  group?: string | null;
};

export type LinkGroup<T extends GroupedLink> = {
  /** Заголовок блока — в том написании, в каком встретился ПЕРВЫМ. */
  title: string;
  links: T[];
};

/** Ключ сравнения заголовков: регистр и лишние пробелы не должны
 *  плодить «Питомцы» и «питомцы» двумя блоками. */
export function groupKey(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Раскладывает ссылки по блокам в порядке появления. Ссылки без
 * заголовка не берём вовсе — они остаются обычными кнопками.
 */
export function buildLinkGroups<T extends GroupedLink>(links: T[]): LinkGroup<T>[] {
  const byKey = new Map<string, LinkGroup<T>>();
  for (const link of links) {
    const title = link.group?.trim();
    if (!title) continue;
    const key = groupKey(title);
    const bucket = byKey.get(key);
    if (bucket) bucket.links.push(link);
    // Заголовок берём от первой ссылки блока: владелец мог набрать
    // вторую строку с маленькой буквы, и блок от этого не должен
    // ни делиться, ни переименовываться.
    else byKey.set(key, { title, links: [link] });
  }
  return [...byKey.values()];
}
