import { prisma } from "@/lib/prisma";
import { notifyAdmins } from "@/lib/adminNotify";

/** Пишет ошибку в /admin/errors; сам никогда не бросает. */
export async function logError(
  error: unknown,
  context?: { path?: string; digest?: string },
): Promise<void> {
  try {
    const e = error instanceof Error ? error : new Error(String(error));
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
