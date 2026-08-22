import path from "path";

// Приватные загрузки (билеты, брони отелей) живут ВНЕ public/: файлы с
// ФИО и номерами броней нельзя раздавать статикой по угадываемой
// ссылке. Отдаёт их только route handler /files/[...path] после
// проверки прав. В Docker каталог — отдельный volume
// private_uploads_data (см. docker-compose.yml), не смонтированный в
// Caddy.
export function privateUploadsDir(...segments: string[]): string {
  const base =
    process.env.PRIVATE_UPLOADS_DIR ?? path.join(process.cwd(), "private-uploads");
  return path.join(base, ...segments);
}

/** Имена файлов генерируются только нами (randomUUID + расширение) —
 *  всё остальное отвергаем, чтобы исключить path traversal. */
export const PRIVATE_FILE_NAME = /^[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/;

export const PRIVATE_FILE_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};
