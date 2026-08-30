import path from "path";
import { unlink } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { privateUploadsDir, PRIVATE_FILE_NAME } from "@/lib/privateUploads";

// Проверки путей приватных файлов (билеты, брони, картинки личных
// событий). Пути приходят из формы строкой, и раньше сервер верил им
// как есть — можно было «усыновить» ЧУЖОЙ приватный файл: вписать его
// путь в свою запись, прочитать через раздачу /files/… (она проверяет
// права по записи), а при удалении своей записи — стереть файл с диска
// у настоящего владельца.

const FOLDERS = ["tickets", "hotels", "personal"] as const;
export type PrivateFolder = (typeof FOLDERS)[number];

/** Путь строго того вида, что возвращают /api/upload-ticket,
 *  /api/upload-hotel, /api/upload-personal: `/files/<folder>/<uuid>.<ext>`.
 *  Папка фиксирована по типу записи — билет не притворится бронью. */
export function isPrivateFileUrl(url: string, folder: PrivateFolder): boolean {
  const prefix = `/files/${folder}/`;
  if (!url.startsWith(prefix)) return false;
  return PRIVATE_FILE_NAME.test(url.slice(prefix.length));
}

/**
 * Не занят ли файл чужой записью. Свои записи (свои билеты, записи в
 * поездках, где пользователь владелец или принятый участник) совпадению
 * не мешают: перепривязка собственного файла безвредна. Имена файлов —
 * randomUUID, угадать чужой путь нельзя, но он утекает, например, из
 * общей поездки — участник видит ссылку на бронь и без этой проверки
 * мог присвоить файл себе.
 */
export async function isPrivateFileFree(url: string, userId: string): Promise<boolean> {
  // «Чужая» поездка: не моя и я в ней не принятый участник.
  const foreignTrip = {
    userId: { not: userId },
    members: { none: { userId, status: "ACCEPTED" as const } },
  };
  const [ticket, booking, personal] = await Promise.all([
    prisma.eventTicket.findFirst({
      where: { fileUrl: url, userId: { not: userId } },
      select: { id: true },
    }),
    prisma.tripBooking.findFirst({
      where: { fileUrl: url, trip: foreignTrip },
      select: { id: true },
    }),
    prisma.tripPersonalEvent.findFirst({
      where: { imageUrl: url, trip: foreignTrip },
      select: { id: true },
    }),
  ]);
  return !ticket && !booking && !personal;
}

/** Формат + незанятость одной проверкой — общий гейт перед записью
 *  пути в базу. */
export async function canAttachPrivateFile(
  url: string,
  folder: PrivateFolder,
  userId: string,
): Promise<boolean> {
  return isPrivateFileUrl(url, folder) && (await isPrivateFileFree(url, userId));
}

/** Удаляет приватный файл с диска, когда запись о нём удалена или файл
 *  заменён. Отсутствие файла — не ошибка (могли удалить раньше), путь
 *  вне приватных папок молча игнорируется. */
export async function unlinkPrivateFile(url: string | null | undefined): Promise<void> {
  if (!url) return;
  for (const folder of FOLDERS) {
    if (url.startsWith(`/files/${folder}/`)) {
      const name = path.basename(url);
      // Только наши имена (uuid.ext) — никакого path traversal.
      if (PRIVATE_FILE_NAME.test(name)) {
        await unlink(privateUploadsDir(folder, name)).catch(() => {});
      }
      return;
    }
  }
}
