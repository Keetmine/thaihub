import { prisma } from "@/lib/prisma";

// Реестр фоновых задач и их запуск по расписанию.
//
// Раньше интервалы были зашиты в instrumentation.ts: поменять час
// прогона можно было только деплоем, а выбрать, каких артистов проверять
// на новинки, было нельзя вовсе. Теперь расписание живёт в БД и
// правится на /admin/schedule.

export type JobDefinition = {
  key: string;
  title: string;
  description: string;
  /** Задача умеет работать по списку артистов (иначе — только «все»). */
  supportsTargets: boolean;
  run: (targetIds: string[] | null) => Promise<string>;
};

/**
 * Все известные задачи. Список в коде, а не в БД: запускать можно только
 * то, для чего есть реализация — иначе строка в таблице обещала бы
 * работу, которой нет.
 *
 * Досинки TMDB сюда пока не заводим: они тяжёлые, а каталог меняется
 * редко — их запускают руками с /admin/performers и /admin/dramas.
 */
export const JOB_DEFINITIONS: JobDefinition[] = [
  {
    key: "youtube-music",
    title: "YouTube Music: новинки",
    description:
      "Обходит артистов со ссылкой на канал и подтягивает новые релизы, песни и обложки. Появившееся попадает в «Что нового» на главной.",
    supportsTargets: true,
    run: async (targetIds) => {
      const { refreshAllYoutubeMusic } = await import("@/lib/youtubeMusicImport");
      const { logImportRun } = await import("@/lib/importRun");
      // Через журнал импортов: ночной прогон раньше не оставлял следа в
      // /admin/imports, и понять, что именно он нашёл, было негде —
      // только итоговая строка в расписании.
      const summarize = (r: {
        checked: number;
        updated: number;
        failed: number;
        newTitles: string[];
      }) =>
        `проверено ${r.checked}, с новинками ${r.updated}, ошибок ${r.failed}` +
        (r.newTitles.length ? `: ${r.newTitles.slice(0, 5).join(", ")}` : "");

      const result = await logImportRun(
        "youtube-music",
        (runId) => refreshAllYoutubeMusic({ performerIds: targetIds, runId }),
        summarize,
      );
      return summarize(result);
    },
  },
  {
    key: "cleanup-expired",
    title: "Чистка просроченного",
    description:
      "Удаляет из БД просроченные сессии и токены сброса пароля — они и так не работают (проверка срока в коде), но копились бессрочно.",
    supportsTargets: false,
    run: async () => {
      const now = new Date();
      const [sessions, tokens] = await Promise.all([
        prisma.userSession.deleteMany({ where: { expiresAt: { lt: now } } }),
        prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } }),
      ]);
      return `сессий удалено ${sessions.count}, токенов сброса ${tokens.count}`;
    },
  },
];

export function jobDefinition(key: string): JobDefinition | undefined {
  return JOB_DEFINITIONS.find((j) => j.key === key);
}

/** Строки расписания вместе с дефолтами для задач, которых ещё нет в БД. */
export async function listJobs() {
  const rows = await prisma.scheduledJob.findMany({
    include: {
      targets: {
        include: { performer: { select: { id: true, name: true, photoUrl: true } } },
      },
    },
  });
  const byKey = new Map(rows.map((r) => [r.key, r]));

  return JOB_DEFINITIONS.map((def) => {
    const row = byKey.get(def.key);
    return {
      ...def,
      enabled: row?.enabled ?? true,
      hour: row?.hour ?? 4,
      targetMode: row?.targetMode ?? ("ALL" as const),
      targets: row?.targets.map((t) => t.performer) ?? [],
      lastRunAt: row?.lastRunAt ?? null,
      lastStatus: row?.lastStatus ?? null,
      lastSummary: row?.lastSummary ?? null,
    };
  });
}

/**
 * Пора ли запускать: наступил нужный час и сегодня ещё не запускались.
 * Сравнение по календарному дню в зоне процесса (TZ=Europe/Moscow) —
 * «раз в сутки в 4 утра» должно означать местные 4 утра.
 */
function isDue(hour: number, lastRunAt: Date | null, now: Date): boolean {
  if (now.getHours() < hour) return false;
  if (!lastRunAt) return true;
  return (
    lastRunAt.getFullYear() !== now.getFullYear() ||
    lastRunAt.getMonth() !== now.getMonth() ||
    lastRunAt.getDate() !== now.getDate()
  );
}

/** Один тик планировщика: запускает всё, чему пришло время. */
export async function runDueJobs(now = new Date()): Promise<string[]> {
  const jobs = await listJobs();
  const started: string[] = [];

  for (const job of jobs) {
    if (!job.enabled || !isDue(job.hour, job.lastRunAt, now)) continue;
    started.push(job.key);
    // Отметку ставим ДО запуска: прогон длинный, и при перезапуске
    // приложения задача не должна стартовать второй раз за сутки.
    await prisma.scheduledJob.upsert({
      where: { key: job.key },
      create: { key: job.key, hour: job.hour, lastRunAt: now, lastStatus: "RUNNING" },
      update: { lastRunAt: now, lastStatus: "RUNNING" },
    });

    const targetIds =
      job.supportsTargets && job.targetMode === "SELECTED"
        ? job.targets.map((t) => t.id)
        : null;

    try {
      const summary = await job.run(targetIds);
      await prisma.scheduledJob.update({
        where: { key: job.key },
        data: { lastStatus: "DONE", lastSummary: summary },
      });
    } catch (err) {
      await prisma.scheduledJob.update({
        where: { key: job.key },
        data: {
          lastStatus: "FAILED",
          lastSummary: err instanceof Error ? err.message : String(err),
        },
      });
      console.warn(`scheduled job ${job.key} failed:`, err);
    }
  }

  return started;
}
