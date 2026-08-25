import type { Dict } from "./i18n/en";

/**
 * Ошибка загрузки файла едет от ручки к клиенту машинным кодом, а не
 * готовой фразой: язык страницы ручке недоступен — клиент дёргает
 * /api/upload по адресу без языкового префикса (в том числе с русской
 * страницы), и proxy положил бы туда английский независимо от языка
 * страницы. Подпись подбирает клиент, у которого язык есть.
 */
export type UploadErrorCode =
  | "NOT_AUTHORIZED"
  | "NO_FILE"
  | "BAD_TYPE"
  | "TOO_LARGE"
  | "BAD_IMAGE";

export type UploadErrorBody = {
  error: UploadErrorCode;
  /** Список принимаемых форматов (BAD_TYPE) и предел размера (TOO_LARGE)
   *  у ручек разные — 8MB и GIF у /api/upload, 10MB и PDF у приватных, —
   *  поэтому едут в ответе, а не лежат в словаре. */
  formats?: string;
  maxMb?: number;
};

/** «image/jpeg» → «JPEG»: названия форматов одинаковы на обоих языках,
 *  поэтому список собирается прямо из allowlist ручки — и не расходится
 *  с ним, когда его правят. */
export function allowedFormats(allowed: Record<string, string>): string {
  return Object.keys(allowed)
    .map((mime) => mime.split("/")[1].toUpperCase())
    .join(", ");
}

/** Подпись к неуспешному ответу загрузки. Незнакомый код — общая фраза:
 *  ручку могли поменять раньше клиента, а молча пустое место под полем
 *  хуже, чем «не удалось загрузить файл». */
export function uploadErrorMessage(t: Dict, body: unknown, fallback: string): string {
  const { error, formats, maxMb } = (body ?? {}) as Partial<UploadErrorBody>;
  const labels = t.widgets.upload;
  switch (error) {
    case "NOT_AUTHORIZED":
      return labels.notAuthorized;
    case "NO_FILE":
      return labels.noFile;
    case "BAD_TYPE":
      return typeof formats === "string" ? labels.badType(formats) : fallback;
    case "TOO_LARGE":
      return typeof maxMb === "number" ? labels.tooLarge(maxMb) : fallback;
    case "BAD_IMAGE":
      return labels.badImage;
    default:
      return fallback;
  }
}
