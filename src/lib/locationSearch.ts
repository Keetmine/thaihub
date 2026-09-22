import { prisma } from "@/lib/prisma";
import type { LocationCategory, Prisma } from "@/generated/prisma/client";

/**
 * Поиск мест для комбобоксов — ранжированный и с тем, по чему место
 * вообще узнают (правка владельца 2026-09-22: «добавление мест
 * неудобное и выводится некрасиво»).
 *
 * Что изменилось против прежнего простого `contains ... orderBy name`:
 *  - **порядок по совпадению, а не по алфавиту.** Тот же приём, что у
 *    артистов (`rankedPerformerSearch`): точное совпадение → начало
 *    названия → вхождение где угодно → совпадение по сериалу. На «Siam»
 *    сверху оказывается ICONSIAM, а не «Khao Tao Beach Lodge Old Siam»;
 *  - **в выдаче есть по чему выбрать**: фото, категория и признак
 *    «своё место». Раньше отдавалось одно название, и десяток похожих
 *    строк был неразличим.
 */
export type LocationOption = {
  id: string;
  name: string;
  photoUrl: string | null;
  category: LocationCategory | null;
  /** Место человек завёл сам (его нет в общем каталоге). */
  own: boolean;
};

const SELECT = {
  id: true,
  name: true,
  photoUrl: true,
  category: true,
  createdByUserId: true,
} as const;

type Row = { id: string; name: string; photoUrl: string | null; category: LocationCategory | null; createdByUserId: string | null };

const LIMIT = 20;

export async function rankedLocationSearch(
  q: string,
  /** Дополнительное условие: «только каталог» в админке, «каталог плюс
   *  свои» на витрине. */
  extra: Prisma.LocationWhereInput,
): Promise<LocationOption[]> {
  const query = q.trim();
  if (query.length < 2) return [];

  const [exact, prefix, rest, byDrama] = await Promise.all([
    prisma.location.findMany({
      where: { ...extra, name: { equals: query, mode: "insensitive" } },
      select: SELECT,
      orderBy: { name: "asc" },
      take: LIMIT,
    }),
    prisma.location.findMany({
      where: { ...extra, name: { startsWith: query, mode: "insensitive" } },
      select: SELECT,
      orderBy: { name: "asc" },
      take: LIMIT,
    }),
    prisma.location.findMany({
      where: { ...extra, name: { contains: query, mode: "insensitive" } },
      select: SELECT,
      orderBy: { name: "asc" },
      take: LIMIT,
    }),
    // «Кафе из Bad Buddy» находится по названию сериала — но это самый
    // слабый сигнал, поэтому идёт последним.
    prisma.location.findMany({
      where: {
        ...extra,
        dramas: { some: { drama: { title: { contains: query, mode: "insensitive" } } } },
      },
      select: SELECT,
      orderBy: { name: "asc" },
      take: LIMIT,
    }),
  ]);

  const seen = new Set<string>();
  const merged: Row[] = [];
  for (const row of [...exact, ...prefix, ...rest, ...byDrama]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
    if (merged.length >= LIMIT) break;
  }

  return merged.map((row) => ({
    id: row.id,
    name: row.name,
    photoUrl: row.photoUrl,
    category: row.category,
    own: row.createdByUserId !== null,
  }));
}
