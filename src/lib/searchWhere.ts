import type { Prisma } from "@/generated/prisma/client";

// Общие where-фрагменты текстового поиска: сериал ищется и по
// альтернативным названиям с MDL (alsoKnownAs, nativeTitle), актёр — и
// по настоящему имени / «также известен как» / муз. псевдониму.
// Используются и на публичных каталогах, и в админских комбобоксах.

export function dramaTitleWhere(q: string): Prisma.DramaWhereInput {
  return {
    OR: [
      { title: { contains: q, mode: "insensitive" } },
      // Русское название — отдельным полем, а не через alsoKnownAs:
      // при слиянии вариантов titleRu из alsoKnownAs сознательно
      // исключается, чтобы не дублировать данные.
      { titleRu: { contains: q, mode: "insensitive" } },
      { alsoKnownAs: { contains: q, mode: "insensitive" } },
      { nativeTitle: { contains: q, mode: "insensitive" } },
    ],
  };
}

export function performerNameWhere(q: string): Prisma.PerformerWhereInput {
  return {
    OR: [
      { name: { contains: q, mode: "insensitive" } },
      { realName: { contains: q, mode: "insensitive" } },
      { alsoKnownAs: { contains: q, mode: "insensitive" } },
      { musicAlias: { contains: q, mode: "insensitive" } },
    ],
  };
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
