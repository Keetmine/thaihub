import { prisma } from "@/lib/prisma";
import { notifyAdmins } from "@/lib/adminNotify";

/**
 * Остановка массового импорта — кооперативная: кнопка «Остановить» в
 * /admin/imports только ставит флаг `ImportRun.cancelRequested`, а сам
 * импорт замечает его между элементами и выходит этой ошибкой. Убивать
 * прогон на полуслове нельзя — уже записанное в каталог должно
 * остаться, поэтому ничего не откатываем: просто не делаем следующий
 * шаг.
 */
export class ImportCancelledError extends Error {
  /** Маркер на случай, если ошибка приедет из другой копии модуля
   *  (dev с hot-reload) — там instanceof уже не сработает. */
  readonly isImportCancelled = true;

  constructor(message = "Остановлено вручную") {
    super(message);
    this.name = "ImportCancelledError";
  }
}

/** Отличает остановку по кнопке от настоящего падения. */
export function isImportCancelledError(e: unknown): boolean {
  return (
    e instanceof ImportCancelledError ||
    (typeof e === "object" && e !== null && "isImportCancelled" in e)
  );
}

/**
 * Точка проверки: зовётся в начале каждой итерации длинных циклов
 * импортёров. Бросает `ImportCancelledError`, если админ нажал
 * «Остановить», — прогон завершится статусом CANCELLED.
 *
 * `runId === null` (импорт запущен скриптом, без записи в журнале) —
 * молча ничего не делает: останавливать нечем и некому.
 */
export async function checkImportCancelled(runId: string | null | undefined): Promise<void> {
  if (!runId) return;
  const run = await prisma.importRun.findUnique({
    where: { id: runId },
    select: { cancelRequested: true },
  });
  if (run?.cancelRequested) throw new ImportCancelledError();
}

/** Оборачивает запуск импорта/синка записью в журнал ImportRun
 *  (/admin/imports): RUNNING → DONE с краткой сводкой, CANCELLED (если
 *  остановили кнопкой) или FAILED.
 *
 *  В колбэк приходит id запуска: импорт, который умеет перечислять
 *  созданное, пишет по нему ImportedItem — тогда в истории видно не
 *  только «+3 альбома», но и какие именно. Кому это не нужно, аргумент
 *  просто не берёт.
 *
 *  Возвращает `null`, если прогон остановили кнопкой: результата у
 *  прерванного импорта нет, и вызывающий по нему различает остановку. */
export async function logImportRun<T>(
  kind: string,
  fn: (runId: string) => Promise<T>,
  summarize: (result: T) => string,
): Promise<T | null> {
  const run = await prisma.importRun.create({ data: { kind } });
  try {
    const result = await fn(run.id);
    await prisma.importRun.update({
      where: { id: run.id },
      data: { status: "DONE", summary: summarize(result), finishedAt: new Date() },
    });
    return result;
  } catch (e) {
    // Остановка по кнопке — не падение: ни статуса FAILED, ни
    // уведомления админам. Наружу ошибку не отдаём — экшен, который
    // запустил импорт, должен спокойно доработать до конца.
    if (isImportCancelledError(e)) {
      const done = await prisma.importedItem.count({ where: { runId: run.id } });
      await prisma.importRun.update({
        where: { id: run.id },
        data: {
          status: "CANCELLED",
          summary: done
            ? `Остановлено вручную, успели импортировать: ${done}`
            : "Остановлено вручную, импортировать ничего не успели",
          finishedAt: new Date(),
        },
      });
      return null;
    }

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
