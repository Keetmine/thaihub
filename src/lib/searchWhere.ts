import type { Prisma } from "@/generated/prisma/client";

// Общие where-фрагменты текстового поиска: сериал ищется и по
// альтернативным названиям с MDL (alsoKnownAs, nativeTitle), актёр — и
// по настоящему имени / «также известен как» / муз. псевдониму.
// Используются и на публичных каталогах, и в админских комбобоксах.

export function dramaTitleWhere(q: string): Prisma.DramaWhereInput {
  return {
    OR: [
      { title: { contains: q, mode: "insensitive" } },
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
