import { createHash, createHmac, timingSafeEqual } from "crypto";

// Клиент Telegram: проверка подписи Login Widget и отправка сообщений
// ботом. Оба механизма используют одного и того же бота
// (TELEGRAM_BOT_TOKEN) — виджет входа обязан быть привязан к боту через
// /setdomain в BotFather, а уведомления бот может слать только тем, кто
// хоть раз нажал у него Start.

export function telegramBotUsername(): string | null {
  // Виджету нужен username без @, но в конфиг его легко вставить с ним.
  return process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") || null;
}

function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return token;
}

export type TelegramAuthPayload = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  photoUrl: string | null;
};

const AUTH_MAX_AGE_SECONDS = 24 * 60 * 60;

/**
 * Проверяет подпись данных Telegram Login Widget по официальной схеме:
 * secret = SHA256(bot_token); hash = HMAC_SHA256(data_check_string,
 * secret), где data_check_string — все поля кроме hash, отсортированные
 * по ключу и склеенные через \n. Возвращает распарсенный профиль или
 * null, если подпись невалидна/протухла.
 */
export function verifyTelegramAuth(params: URLSearchParams): TelegramAuthPayload | null {
  const hash = params.get("hash");
  const authDate = Number(params.get("auth_date"));
  const id = params.get("id");
  if (!hash || !id || !Number.isFinite(authDate)) return null;
  if (Date.now() / 1000 - authDate > AUTH_MAX_AGE_SECONDS) return null;

  const pairs = Array.from(params.entries())
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`);
  const dataCheckString = pairs.join("\n");

  const secret = createHash("sha256").update(botToken()).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest();
  const actual = Buffer.from(hash, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  return {
    id,
    firstName: params.get("first_name"),
    lastName: params.get("last_name"),
    username: params.get("username"),
    photoUrl: params.get("photo_url"),
  };
}

/**
 * Отправляет личное сообщение от бота. Вернёт false (не бросит), если
 * пользователь не нажимал Start у бота (Telegram отвечает 403) — для
 * рассылки уведомлений это ожидаемый, а не аварийный случай.
 */
export async function sendTelegramMessage(chatId: string, text: string): Promise<boolean> {
  const res = await fetch(`https://api.telegram.org/bot${botToken()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  if (res.status === 403) return false;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Telegram sendMessage -> HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return true;
}
