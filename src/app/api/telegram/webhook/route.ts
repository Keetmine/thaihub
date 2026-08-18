import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { answerPreCheckoutQuery, sendTelegramMessage } from "@/lib/telegram";
import { extendPremium } from "@/lib/premium";
import { notifyAdmins } from "@/lib/adminNotify";

// Вебхук Telegram-бота — регистрируется скриптом
// scripts/setup-telegram-webhook.ts (setWebhook с secret_token).
// Обрабатывает оплату подписки Stars (pre_checkout_query подтверждаем,
// successful_payment зачисляем по payload — это наш userId, заложенный
// в инвойс createPremiumInvoiceLink) и команды /start, /terms,
// /support: последние две обязательны для ботов, принимающих Stars
// (Live Checklist в core.telegram.org/bots/payments-stars).
type TelegramUpdate = {
  pre_checkout_query?: { id: string; invoice_payload: string };
  message?: {
    text?: string;
    from?: { id: number };
    chat?: { id: number };
    successful_payment?: {
      invoice_payload: string;
      total_amount: number;
      telegram_payment_charge_id: string;
    };
  };
};

const APP_URL = process.env.APP_URL ?? "https://myblhub.com";

/** Ответы на команды. Бот молчал на любой текст — для платёжного бота
 *  это прямое нарушение требований Telegram, да и человеку непонятно. */
const COMMAND_REPLIES: Record<string, string> = {
  "/start":
    `Привет! Это бот <b>MyBLHub</b> — трекера концертов и фанмитов тайских BL-актёров.\n\n` +
    `Я присылаю напоминания о событиях из избранного, сигналы о старте продаж билетов и новости друзей.\n\n` +
    `Сайт: ${APP_URL}\n` +
    `Команды: /terms — условия, /support — поддержка`,
  "/terms":
    `<b>Условия использования MyBLHub</b>\n\n` +
    `Подписка открывает афишу событий, календарь, поездки и уведомления на 30 дней с момента оплаты.\n\n` +
    `Оплата разовая, автопродления нет — подписка просто заканчивается.\n\n` +
    `Возврат: напишите нам в течение 14 дней, если сервис не заработал как обещано, — вернём звёзды.\n\n` +
    `Полный текст: ${APP_URL}/terms`,
  "/support":
    `Нужна помощь? Напишите нам: ${APP_URL}/help\n\n` +
    `Опишите, что случилось, — отвечаем в течение пары дней.`,
};

export async function POST(request: Request) {
  // Подлинность запроса: Telegram шлёт секрет, заданный при setWebhook.
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
  if (!update) return NextResponse.json({ ok: true });

  if (update.pre_checkout_query) {
    const { id, invoice_payload } = update.pre_checkout_query;
    const user = await prisma.user.findUnique({ where: { id: invoice_payload } });
    await answerPreCheckoutQuery(id, !!user, user ? undefined : "Аккаунт не найден");
    return NextResponse.json({ ok: true });
  }

  // Команды: отвечаем и выходим — оплата этим же апдейтом не приходит.
  const text = update.message?.text?.trim().split(/\s+/)[0].toLowerCase();
  const chatId = update.message?.chat?.id ?? update.message?.from?.id;
  if (text && chatId && COMMAND_REPLIES[text]) {
    await sendTelegramMessage(String(chatId), COMMAND_REPLIES[text]).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  const payment = update.message?.successful_payment;
  if (payment) {
    const user = await prisma.user.findUnique({ where: { id: payment.invoice_payload } });
    if (user) {
      const until = extendPremium(user.premiumUntil);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          premiumUntil: until,
          // Свежая оплата обнуляет дедуп напоминания об истечении.
          premiumExpiryNotifiedFor: null,
          // Заодно привязываем Telegram, если ещё не привязан — оплата
          // пришла из его аккаунта, это надёжный сигнал.
          ...(user.telegramId || !update.message?.from
            ? {}
            : { telegramId: String(update.message.from.id) }),
        },
      });
      // Журнал оплат (/admin/finance): upsert по charge id — Telegram
      // может ретраить вебхук, дубль не создаётся.
      await prisma.payment.upsert({
        where: { telegramChargeId: payment.telegram_payment_charge_id },
        create: {
          userId: user.id,
          amount: payment.total_amount,
          telegramChargeId: payment.telegram_payment_charge_id,
        },
        update: {},
      });
      console.log(
        `premium payment: user ${user.id}, charge ${payment.telegram_payment_charge_id}, until ${until.toISOString()}`,
      );
      await notifyAdmins(
        "payment",
        `⭐️ Оплата подписки: ${user.name ?? user.email ?? user.id}, ${payment.total_amount} Stars. Активна до ${until.toLocaleDateString("ru-RU")}.`,
      );
      if (update.message?.from) {
        await sendTelegramMessage(
          String(update.message.from.id),
          `✅ Подписка MyBLHub активна до ${until.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}. Спасибо!`,
        ).catch(() => {});
      }
    } else {
      console.warn(`premium payment for unknown user payload: ${payment.invoice_payload}`);
    }
  }

  return NextResponse.json({ ok: true });
}
