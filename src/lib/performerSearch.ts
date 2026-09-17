import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { performerNameWhere, performerOptionLabel } from "@/lib/searchWhere";

/**
 * Ранжированный поиск исполнителей для комбобоксов: точные совпадения
 * ника/имени → совпадения по началу → просто contains. Без этого «tay»
 * тонул в двадцати «Amart-tay-akul» из-за алфавитной сортировки и
 * take: 20. В подписи вариантов — настоящее имя в скобках.
 *
 * Общий модуль для админки и публичных форм (правка владельца
 * 2026-09-17: у артистов личного события поездки поиск был простым
 * contains по алфавиту, и «Tay» уходил вниз списка). Прав здесь не
 * проверяем — это делает вызывающее действие.
 */
export async function rankedPerformerSearch(
  q: string,
  extra: Prisma.PerformerWhereInput,
): Promise<{ id: string; name: string; photoUrl: string | null }[]> {
  const select = { id: true, name: true, realName: true, photoUrl: true } as const;
  const nameFields = ["name", "realName", "musicAlias"] as const;

  const [exact, prefix, rest] = await Promise.all([
    prisma.performer.findMany({
      where: {
        ...extra,
        OR: nameFields.map((f) => ({ [f]: { equals: q, mode: "insensitive" } })),
      },
      select,
      orderBy: { name: "asc" },
      take: 20,
    }),
    prisma.performer.findMany({
      where: {
        ...extra,
        OR: nameFields.map((f) => ({ [f]: { startsWith: q, mode: "insensitive" } })),
      },
      select,
      orderBy: { name: "asc" },
      take: 20,
    }),
    prisma.performer.findMany({
      where: { ...extra, ...performerNameWhere(q) },
      select,
      orderBy: { name: "asc" },
      take: 20,
    }),
  ]);

  const seen = new Set<string>();
  const merged: typeof exact = [];
  for (const p of [...exact, ...prefix, ...rest]) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    merged.push(p);
    if (merged.length >= 20) break;
  }
  return merged.map((p) => ({
    id: p.id,
    name: performerOptionLabel(p),
    photoUrl: p.photoUrl,
  }));
}
