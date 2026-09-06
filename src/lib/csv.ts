// Выгрузка своих данных таблицей (АА16). Чистые функции без Prisma —
// их гоняет tests/unit/csv.test.ts.

/**
 * Разделитель — ТОЧКА С ЗАПЯТОЙ, а не запятая: файл открывают в Excel с
 * русской локалью, а он в этой локали ждёт именно её и на запятой
 * сваливает всю строку в одну ячейку. Google Sheets понимает оба.
 */
const SEP = ";";

/** Экранирование по RFC 4180: кавычки удваиваются, а поле берётся в
 *  кавычки, если внутри разделитель, кавычка или перенос строки. */
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? formatDate(value) : String(value);
  if (text === "") return "";
  const needsQuotes = text.includes(SEP) || text.includes('"') || /[\r\n]/.test(text);
  const escaped = text.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

/** Дата в таблице — «2026-10-18»: сортируется как текст и одинаково
 *  читается в любой локали, в отличие от «18.10.2026». */
export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Дата со временем — «2026-10-18 19:30»; секунды в наших данных
 *  никогда не значимы. */
export function formatDateTime(d: Date): string {
  return `${formatDate(d)} ${d.toISOString().slice(11, 16)}`;
}

/**
 * Строки таблицы в CSV. Первая строка — заголовки колонок.
 *
 * В начало ставится BOM: без него Excel читает файл как cp1251 и вместо
 * русских названий показывает кракозябры. Google Sheets и LibreOffice
 * BOM спокойно проглатывают.
 */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(SEP));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** Имя файла выгрузки: «myblhub-сериалы-2026-09-06.csv». */
export function csvFileName(kind: string, now = new Date()): string {
  return `myblhub-${kind}-${formatDate(now)}.csv`;
}
