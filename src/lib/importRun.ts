import { prisma } from "@/lib/prisma";

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
    await prisma.importRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        summary: e instanceof Error ? e.message : String(e),
        finishedAt: new Date(),
      },
    });
    throw e;
  }
}
