import type { Prisma } from "@/generated/prisma/client";

// Общие where-фрагменты текстового поиска: сериал ищется и по
// альтернативным названиям с MDL (alsoKnownAs, nativeTitle), актёр — и
// по настоящему имени / «также известен как» / муз. псевдониму.
// Используются и на публичных каталогах, и в админских комбобоксах.

/**
 * Слова запроса. Ищем ПО КАЖДОМУ отдельно, потому что имя человека
 * разложено по разным полям: у «Babe (Tanatat Phanviriyakool)» ник в
 * `name`, а настоящее имя в `realName`, и запрос «Babe Tanatat» целиком
 * не совпадал ни с одним полем — находился только «Babe» (жалоба
 * владельца 2026-09-06). Теперь каждое слово должно найтись хоть
 * где-нибудь, а вместе они дают пересечение: «Babe Tanatat» и «Babe
 * Tanatat Phanviriyakool» приводят к той же карточке.
 *
 * Потолок в шесть слов — от бессмысленно длинных запросов: каждое слово
 * это отдельное условие в SQL.
 */
function queryWords(q: string): string[] {
  return q.trim().split(/\s+/).filter(Boolean).slice(0, 6);
}

export function dramaTitleWhere(q: string): Prisma.DramaWhereInput {
  const fieldsFor = (w: string): Prisma.DramaWhereInput => ({
    OR: [
      { title: { contains: w, mode: "insensitive" } },
      // Русское название — отдельным полем, а не через alsoKnownAs:
      // при слиянии вариантов titleRu из alsoKnownAs сознательно
      // исключается, чтобы не дублировать данные.
      { titleRu: { contains: w, mode: "insensitive" } },
      { alsoKnownAs: { contains: w, mode: "insensitive" } },
      { nativeTitle: { contains: w, mode: "insensitive" } },
    ],
  });

  const words = queryWords(q);
  // Пустой запрос сюда доходит редко (вызывающие проверяют сами), но
  // вести себя должен как раньше — «подходит всё».
  if (words.length <= 1) return fieldsFor(words[0] ?? q);
  return { AND: words.map(fieldsFor) };
}

export function performerNameWhere(q: string): Prisma.PerformerWhereInput {
  const fieldsFor = (w: string): Prisma.PerformerWhereInput => ({
    OR: [
      { name: { contains: w, mode: "insensitive" } },
      { realName: { contains: w, mode: "insensitive" } },
      { alsoKnownAs: { contains: w, mode: "insensitive" } },
      { musicAlias: { contains: w, mode: "insensitive" } },
    ],
  });

  const words = queryWords(q);
  if (words.length <= 1) return fieldsFor(words[0] ?? q);
  return { AND: words.map(fieldsFor) };
}

/** Подпись варианта в комбобоксах: ник + настоящее имя в скобках,
 *  если оно есть и отличается от ника. */
export function performerOptionLabel(p: { name: string; realName: string | null }): string {
  const real = performerRealNameParen(p);
  return real ? `${p.name} (${real})` : p.name;
}

/** Реальное имя для вывода в скобках рядом с ником — null, если его нет
 *  или оно совпадает с ником (для стилизации скобок отдельным цветом). */
export function performerRealNameParen(p: { name: string; realName: string | null }): string | null {
  if (!p.realName || p.realName.trim().toLowerCase() === p.name.trim().toLowerCase()) {
    return null;
  }
  return p.realName;
}

/**
 * Склейка ярусов выдачи без повторов: точные совпадения, затем
 * префиксные, затем «где-то внутри». Без этого живой поиск сортировал
 * по алфавиту, и артист по имени Gun стоял НИЖЕ всех, у кого «gun»
 * прячется внутри настоящего имени (Balogun, Gundon…).
 */
export function rankedMerge<T extends { id: string }>(tiers: T[][], take: number): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const tier of tiers) {
    for (const row of tier) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
      if (out.length >= take) return out;
    }
  }
  return out;
}
