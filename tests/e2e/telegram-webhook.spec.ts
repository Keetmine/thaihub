import "dotenv/config";
import { test, expect } from "@playwright/test";

// Вебхук Telegram-бота (src/app/api/telegram/webhook/route.ts). Тесты
// ходят на ЖИВОЙ dev-сервер с настоящим TELEGRAM_BOT_TOKEN, поэтому здесь
// только сценарии, которые гарантированно не доходят до Telegram Bot API:
// проверка секрета и устойчивость к мусору. Намеренно НЕ покрыты:
//  - update с message.text — роут шлёт notifyAdmins (реальные сообщения
//    админам в Telegram) и sendTelegramMessage отправителю;
//  - pre_checkout_query — роут зовёт answerPreCheckoutQuery (реальный
//    вызов Bot API боевым токеном);
//  - successful_payment — зачисляет подписку, пишет Payment и шлёт
//    notifyAdmins + подтверждение в чат плательщика.
// Эти ветки — только вручную или на стенде с фейковым токеном.

const WEBHOOK = "/api/telegram/webhook";
// Секрет из .env (его же проверяет живой сервер). Загружен dotenv'ом выше.
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

test("вебхук без секретного заголовка отвечает 403", async ({ request }) => {
  const res = await request.post(WEBHOOK, { data: {} });
  expect(res.status()).toBe(403);
});

test("вебхук с неверным секретом отвечает 403", async ({ request }) => {
  const res = await request.post(WEBHOOK, {
    headers: { "x-telegram-bot-api-secret-token": "definitely-wrong-secret" },
    data: {},
  });
  expect(res.status()).toBe(403);
});

test("вебхук с верным секретом переживает мусорный JSON", async ({ request }) => {
  test.skip(!secret, "TELEGRAM_WEBHOOK_SECRET не задан в .env");
  const res = await request.post(WEBHOOK, {
    headers: {
      "x-telegram-bot-api-secret-token": secret!,
      "content-type": "application/json",
    },
    data: "это не JSON {{{",
  });
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});

test("вебхук с верным секретом игнорирует незнакомый update", async ({ request }) => {
  // update без message и pre_checkout_query не задевает ни одну ветку с
  // Telegram API — безопасно против живого сервера.
  test.skip(!secret, "TELEGRAM_WEBHOOK_SECRET не задан в .env");
  const res = await request.post(WEBHOOK, {
    headers: { "x-telegram-bot-api-secret-token": secret! },
    data: { update_id: 1 },
  });
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});
