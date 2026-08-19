import { prisma } from "@/lib/prisma";
import { notifyAdmins } from "@/lib/adminNotify";

// Не ошибки приложения, а обрывы соединения: пользователь ушёл со
// страницы, не дождавшись рендера. Их поток забивал /admin/errors, и
// настоящие проблемы в нём терялись.
const IGNORED_PATTERNS = [
  "The destination stream closed early",
  "aborted",
  "ECONNRESET",
];

/** Пишет ошибку в /admin/errors; сам никогда не бросает. */
export async function logError(
  error: unknown,
  context?: { path?: string; digest?: string },
): Promise<void> {
  try {
    const e = error instanceof Error ? error : new Error(String(error));
    if (IGNORED_PATTERNS.some((p) => e.message.includes(p))) return;
    await prisma.errorLog.create({
      data: {
        message: e.message.slice(0, 1000),
        stack: e.stack?.slice(0, 4000) ?? null,
        path: context?.path ?? null,
        digest: context?.digest ?? null,
      },
    });
    // По умолчанию канал «error» выключен — включается в /admin/settings,
    // если хочется знать о падениях сразу. Дедуп по тексту: одна и та же
    // ошибка сыплется пачками.
    await notifyAdmins("error", `💥 Ошибка на ${context?.path ?? "неизвестной странице"}\n\n${e.message.slice(0, 500)}`, {
      dedupKey: e.message.slice(0, 120),
    });
  } catch {
    // лог не должен ронять то, что логирует
  }
}
