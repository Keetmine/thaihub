// Запускается один раз на старте сервера (конвенция instrumentation.ts).
// Единственная фоновая задача приложения — телеграм-напоминания о
// событиях: раз в 30 минут проверяем даты, начинающиеся в ближайшие
// сутки, и шлём непосланные напоминания. Отдельного cron в деплое нет
// (docker-compose с одним app-контейнером), поэтому таймер внутри
// процесса — самое простое надёжное место.
const INTERVAL_MS = 30 * 60 * 1000;

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.TELEGRAM_BOT_TOKEN) return;

  // Динамический импорт — чтобы Prisma и её цепочка не тянулись в
  // edge/build контексты, где register тоже вызывается.
  const { sendUpcomingEventReminders, sendPremiumExpiryReminders, sendPresaleReminders } =
    await import("@/lib/telegramNotifications");

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
}
