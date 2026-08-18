import { prisma } from "@/lib/prisma";
import { notifyAdmins } from "@/lib/adminNotify";

/** Оборачивает запуск импорта/синка записью в журнал ImportRun
 *  (/admin/imports): RUNNING → DONE с краткой сводкой или FAILED. */
export async function logImportRun<T>(
  kind: string,
  fn: () => Promise<T>,
  summarize: (result: T) => string,
): Promise<T> {
  const run = await prisma.importRun.create({ data: { kind } });
  try {
    const result = await fn();
    await prisma.importRun.update({
      where: { id: run.id },
      data: { status: "DONE", summary: summarize(result), finishedAt: new Date() },
    });
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.importRun.update({
      where: { id: run.id },
      data: { status: "FAILED", summary: message, finishedAt: new Date() },
    });
    // Импорт мог быть запущен кнопкой и молча упасть — до уведомлений об
    // этом узнавали, только заглянув в /admin/imports.
    await notifyAdmins("import", `⚠️ Импорт «${kind}» упал\n\n${message.slice(0, 500)}`, {
      dedupKey: kind,
    });
    throw e;
  }
}
