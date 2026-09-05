// Запускается один раз на старте сервера (конвенция instrumentation.ts).
// Единственная фоновая задача приложения — телеграм-напоминания о
// событиях: раз в 30 минут проверяем даты, начинающиеся в ближайшие
// сутки, и шлём непосланные напоминания. Отдельного cron в деплое нет
// (docker-compose с одним app-контейнером), поэтому таймер внутри
// процесса — самое простое надёжное место.
const INTERVAL_MS = 30 * 60 * 1000;
// Планировщик просыпается часто, а запускает лишь то, чему пришло время
// по расписанию из БД (/admin/schedule): час прогона и список артистов
// правятся без деплоя.
const SCHEDULER_INTERVAL_MS = 10 * 60 * 1000;

export async function register() {
  // Sentry инициализируется первым: иначе ошибки старта не попадут в него.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Прогоны импортов живут в памяти процесса: перезапуск контейнера
  // (деплой, OOM) убивает их, а строка ImportRun остаётся RUNNING
  // навсегда — и пока она есть, /admin/imports держит все кнопки
  // «Импортировать» заблокированными с подписью «Импорт идёт…».
  // Реальный случай 2026-09-05: после серии деплоев владелец не мог
  // импортировать заявки подруги. На старте закрываем такие хвосты.
  try {
    const { prisma } = await import("@/lib/prisma");
    const stale = await prisma.importRun.updateMany({
      where: { status: "RUNNING" },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        summary: "Прерван перезапуском сервера — запустите заново",
      },
    });
    if (stale.count > 0) console.log(`import runs: закрыто зависших после перезапуска: ${stale.count}`);
  } catch (err) {
    console.warn(`stale import runs cleanup failed: ${err instanceof Error ? err.message : err}`);
  }

  if (!process.env.TELEGRAM_BOT_TOKEN) return;

  // Динамический импорт — чтобы Prisma и её цепочка не тянулись в
  // edge/build контексты, где register тоже вызывается.
  const {
    sendUpcomingEventReminders,
    sendPremiumExpiryReminders,
    sendPresaleReminders,
    sendBirthdayNotifications,
    sendEpisodeNotifications,
    sendOnlineBookingReminders,
  } = await import("@/lib/telegramNotifications");

  // Защита от наложения прогонов: mdl-auto-update может идти дольше
  // интервала планировщика, и второй тик не должен запускать то же самое
  // поверх первого. Флаг на модуль — прогоны в этом процессе строго по
  // одному (второй уровень защиты — атомарный захват в runDueJobs).
  let schedulerRunning = false;
  const runScheduler = async () => {
    if (schedulerRunning) return;
    schedulerRunning = true;
    try {
      const { runDueJobs } = await import("@/lib/scheduledJobs");
      const started = await runDueJobs();
      if (started.length > 0) console.log(`scheduler: запущено ${started.join(", ")}`);
    } catch (err) {
      console.warn(`scheduler failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      schedulerRunning = false;
    }
  };

  let remindersRunning = false;
  const run = async () => {
    if (remindersRunning) return;
    remindersRunning = true;
    try {
      const { sent } = await sendUpcomingEventReminders();
      if (sent > 0) console.log(`telegram reminders: sent ${sent}`);
      const expiry = await sendPremiumExpiryReminders();
      if (expiry > 0) console.log(`premium expiry reminders: sent ${expiry}`);
      const presale = await sendPresaleReminders();
      if (presale > 0) console.log(`presale reminders: sent ${presale}`);
      const birthdays = await sendBirthdayNotifications();
      if (birthdays > 0) console.log(`birthday notifications: sent ${birthdays}`);
      const episodes = await sendEpisodeNotifications();
      if (episodes > 0) console.log(`episode notifications: sent ${episodes}`);
      const bookings = await sendOnlineBookingReminders();
      if (bookings > 0) console.log(`online booking reminders: sent ${bookings}`);
    } catch (err) {
      console.warn(`telegram reminders failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      remindersRunning = false;
    }
  };

  // Не setInterval: он тикает по часам, не дожидаясь прошлого прогона, и
  // длинный прогон (mdl-auto-update идёт десятки минут при 10-минутном
  // интервале) накладывался бы сам на себя. Следующий тик планируется
  // только ПОСЛЕ завершения текущего.
  const loop = (fn: () => Promise<void>, intervalMs: number, firstDelayMs: number) => {
    const tick = async () => {
      try {
        await fn();
      } finally {
        setTimeout(tick, intervalMs);
      }
    };
    setTimeout(tick, firstDelayMs);
  };

  // Первый прогон напоминаний — через минуту после старта (даём БД/
  // миграциям устаканиться); планировщик — через 5 минут, чтобы длинные
  // прогоны не совпадали с деплоем и разогревом приложения.
  loop(run, INTERVAL_MS, 60 * 1000);
  loop(runScheduler, SCHEDULER_INTERVAL_MS, 5 * 60 * 1000);
}

/** Хук Next.js: любая необработанная серверная ошибка (страницы,
 *  route handlers, server actions) попадает в /admin/errors. */
export async function onRequestError(
  err: unknown,
  // Сигнатуру держим как у Next: Sentry ждёт метод и заголовки, а не
  // только путь.
  request: { path: string; method: string; headers: { [key: string]: string | undefined } },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // В Sentry — со стектрейсом и группировкой; в свой журнал
  // (/admin/errors) — чтобы быстрый взгляд «что упало за сутки» не
  // требовал внешнего сервиса.
  if (process.env.SENTRY_DSN) {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureRequestError(
      err,
      request,
      context as Parameters<typeof Sentry.captureRequestError>[2],
    );
  }
  const { logError } = await import("@/lib/errorLog");
  const digest =
    err && typeof err === "object" && "digest" in err ? String((err as { digest: unknown }).digest) : undefined;
  await logError(err, { path: request.path, digest });
}
