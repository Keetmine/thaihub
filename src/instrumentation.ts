// Запускается один раз на старте сервера (конвенция instrumentation.ts).
// Единственная фоновая задача приложения — телеграм-напоминания о
// событиях: раз в 30 минут проверяем даты, начинающиеся в ближайшие
// сутки, и шлём непосланные напоминания. Отдельного cron в деплое нет
// (docker-compose с одним app-контейнером), поэтому таймер внутри
// процесса — самое простое надёжное место.
const INTERVAL_MS = 30 * 60 * 1000;
// Раз в сутки обходим YouTube Music по всем артистам с привязанным
// каналом: новые релизы подтягиваются сами и попадают в «Что нового».
const YTM_INTERVAL_MS = 24 * 60 * 60 * 1000;

export async function register() {
  // Sentry инициализируется первым: иначе ошибки старта не попадут в него.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.TELEGRAM_BOT_TOKEN) return;

  // Динамический импорт — чтобы Prisma и её цепочка не тянулись в
  // edge/build контексты, где register тоже вызывается.
  const { sendUpcomingEventReminders, sendPremiumExpiryReminders, sendPresaleReminders } =
    await import("@/lib/telegramNotifications");

  const runYoutubeMusic = async () => {
    try {
      const { refreshAllYoutubeMusic } = await import("@/lib/youtubeMusicImport");
      const { logImportRun } = await import("@/lib/importRun");
      await logImportRun(
        "youtube-music-daily",
        () => refreshAllYoutubeMusic(),
        (r) =>
          `проверено ${r.checked}, с новинками ${r.updated}, ошибок ${r.failed}` +
          (r.newTitles.length ? `: ${r.newTitles.slice(0, 5).join(", ")}` : ""),
      );
    } catch (err) {
      console.warn(
        `youtube music daily failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  };

  const run = async () => {
    try {
      const { sent } = await sendUpcomingEventReminders();
      if (sent > 0) console.log(`telegram reminders: sent ${sent}`);
      const expiry = await sendPremiumExpiryReminders();
      if (expiry > 0) console.log(`premium expiry reminders: sent ${expiry}`);
      const presale = await sendPresaleReminders();
      if (presale > 0) console.log(`presale reminders: sent ${presale}`);
    } catch (err) {
      console.warn(`telegram reminders failed: ${err instanceof Error ? err.message : err}`);
    }
  };

  // Первый прогон — через минуту после старта (даём БД/миграциям
  // устаканиться), дальше по интервалу.
  setTimeout(run, 60 * 1000);
  setInterval(run, INTERVAL_MS);

  // YouTube Music — отдельным, более редким циклом. Первый прогон через
  // 10 минут после старта: обход десятков каналов не должен совпадать с
  // деплоем и разогревом приложения.
  setTimeout(runYoutubeMusic, 10 * 60 * 1000);
  setInterval(runYoutubeMusic, YTM_INTERVAL_MS);
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
