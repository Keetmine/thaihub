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

  // В строку проверки идут ТОЛЬКО поля, которые подписывает Telegram.
  // Свои параметры (например ?mode=link для привязки из настроек)
  // возвращаются вместе с ними и ломали подпись: она не сходилась, и
  // привязка молча уводила на логин.
  const TELEGRAM_FIELDS = new Set([
    "id",
    "first_name",
    "last_name",
    "username",
    "photo_url",
    "auth_date",
  ]);
  const pairs = Array.from(params.entries())
    .filter(([key]) => TELEGRAM_FIELDS.has(key))
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

// Дедлайн на любой вызов Bot API: у fetch в Node своего таймаута нет, и
// зависший запрос держал бы получасовой прогон рассылки бесконечно.
const API_TIMEOUT_MS = 10000;

/** POST к методу Bot API с таймаутом и внятной ошибкой (какой метод не
 *  ответил) — голое «operation was aborted» в журнале ни о чём. */
async function callTelegram(method: string, body: unknown): Promise<Response> {
  try {
    return await fetch(`https://api.telegram.org/bot${botToken()}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch (e) {
    throw new Error(
      `Telegram ${method}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`,
    );
  }
}

/**
 * Отправляет личное сообщение от бота. Вернёт false (не бросит), если
 * пользователь не нажимал Start у бота (Telegram отвечает 403) — для
 * рассылки уведомлений это ожидаемый, а не аварийный случай.
 */
export async function sendTelegramMessage(chatId: string, text: string): Promise<boolean> {
  const res = await callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
  if (res.status === 403) return false;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Telegram sendMessage -> HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return true;
}

// ---------- Оплата подписки (Telegram Stars) ----------

export const PREMIUM_PRICE_STARS = Number(process.env.PREMIUM_PRICE_STARS || 250);

/**
 * Ссылка-инвойс на месяц подписки в Telegram Stars (валюта XTR — без
 * банковского эквайринга и provider_token). В payload кладём наш userId:
 * по нему вебхук зачисляет оплату, поэтому привязка Telegram к аккаунту
 * для покупки не обязательна.
 */
export async function createPremiumInvoiceLink(
  userId: string,
  priceStars: number = PREMIUM_PRICE_STARS,
): Promise<string> {
  const res = await callTelegram("createInvoiceLink", {
    title: "Подписка MyBLHub — 1 месяц",
    description: "Полная афиша событий, календарь, поездки и уведомления на 30 дней.",
    payload: userId,
    currency: "XTR",
    prices: [{ label: "Подписка на месяц", amount: priceStars }],
  });
  const data = (await res.json()) as { ok: boolean; result?: string; description?: string };
  if (!data.ok || !data.result) {
    throw new Error(`createInvoiceLink failed: ${data.description ?? res.status}`);
  }
  return data.result;
}

/**
 * Возврат оплаченных звёзд (refundStarPayment). Нужен и для проверки
 * оплаты на живом боте — песочницы у Stars нет, поэтому тестовый платёж
 * проводится настоящими звёздами и возвращается этой же кнопкой, — и
 * для обычных просьб о возврате.
 */
export async function refundStarPayment(
  telegramUserId: string,
  chargeId: string,
): Promise<void> {
  const res = await callTelegram("refundStarPayment", {
    user_id: Number(telegramUserId),
    telegram_payment_charge_id: chargeId,
  });
  const data = (await res.json()) as { ok: boolean; description?: string };
  if (!data.ok) throw new Error(`refundStarPayment failed: ${data.description ?? res.status}`);
}

export async function answerPreCheckoutQuery(id: string, ok: boolean, errorMessage?: string): Promise<void> {
  // Не бросает: ответ на pre_checkout — best effort (не успели за 10
  // секунд — Telegram сам откажет покупателю), но молчать про не-ok
  // нельзя, иначе «оплата не проходит» не оставляет следов в логах.
  try {
    const res = await callTelegram("answerPreCheckoutQuery", {
      pre_checkout_query_id: id,
      ok,
      ...(errorMessage ? { error_message: errorMessage } : {}),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`Telegram answerPreCheckoutQuery -> HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
  } catch (e) {
    console.warn(e instanceof Error ? e.message : String(e));
  }
}
