import "dotenv/config";

/**
 * Регистрирует вебхук бота для приёма оплат (см.
 * src/app/api/telegram/webhook/route.ts). Запускать один раз после
 * деплоя (нужен публичный HTTPS-домен в APP_URL):
 *   npx tsx scripts/setup-telegram-webhook.ts
 * Требует TELEGRAM_BOT_TOKEN, APP_URL и TELEGRAM_WEBHOOK_SECRET в .env.
 */
async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const appUrl = process.env.APP_URL;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !appUrl || !secret) {
    throw new Error("Нужны TELEGRAM_BOT_TOKEN, APP_URL и TELEGRAM_WEBHOOK_SECRET");
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: `${appUrl}/api/telegram/webhook`,
      secret_token: secret,
      // Только то, что обрабатываем — меньше шума в вебхук.
      allowed_updates: ["message", "pre_checkout_query"],
    }),
  });
  console.log(await res.json());
}

main();
