import "dotenv/config";

// Список команд бота (кнопка «Меню» в чате). /terms и /support
// обязательны для ботов, принимающих Telegram Stars — см. Live Checklist
// в core.telegram.org/bots/payments-stars. Обработка — в
// src/app/api/telegram/webhook/route.ts.
const COMMANDS = [
  { command: "start", description: "О боте и сайте" },
  { command: "terms", description: "Условия использования и возврат" },
  { command: "support", description: "Написать в поддержку" },
];

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN не задан");

  const res = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commands: COMMANDS }),
  });
  const data = (await res.json()) as { ok: boolean; description?: string };
  if (!data.ok) throw new Error(`setMyCommands failed: ${data.description}`);
  console.log("Команды бота обновлены:", COMMANDS.map((c) => `/${c.command}`).join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
