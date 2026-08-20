import type { Prisma } from "@/generated/prisma/client";

/**
 * Фото исполнителя с запасным вариантом — обложкой последнего релиза.
 *
 * У групп и новых артистов фото часто нет вовсе, и на месте карточки
 * оставалась буква. Обложка свежего альбома узнаваема не хуже и всегда
 * под рукой — она уже скачана к нам импортом с YouTube Music.
 *
 * Подстановка делается при отображении, а не записью в photoUrl: иначе
 * обложка «замёрзнет» в базе, в админке будет непонятно, есть ли у
 * артиста настоящее фото, и с выходом нового релиза картинка не
 * обновится.
 */
export type PhotoSource = {
  photoUrl: string | null;
  albums?: { coverUrl: string | null; year: number | null }[];
};

export function performerPhoto(performer: PhotoSource): string | null {
  if (performer.photoUrl) return performer.photoUrl;
  const cover = performer.albums?.find((a) => a.coverUrl);
  return cover?.coverUrl ?? null;
}

/**
 * Аргумент include/select: последний релиз с обложкой — его и берём.
 * Без `as const`: Prisma не принимает readonly-массив в orderBy.
 */
export const FALLBACK_COVER_SELECT: Prisma.Performer$albumsArgs = {
  where: { coverUrl: { not: null } },
  select: { coverUrl: true, year: true },
  orderBy: [{ year: "desc" }, { createdAt: "desc" }],
  take: 1,
};
