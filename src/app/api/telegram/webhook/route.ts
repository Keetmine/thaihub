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
    from?: { id: number; first_name?: string; username?: string };
    chat?: { id: number };
    /** На какое сообщение отвечают. Так админ отвечает человеку: жмёт
     *  «Ответить» на пересланном обращении, и мы по нему узнаём, кому
     *  адресован ответ. */
    reply_to_message?: { text?: string };
    successful_payment?: {
      invoice_payload: string;
      total_amount: number;
      telegram_payment_charge_id: string;
    };
  };
};

const APP_URL = process.env.APP_URL ?? "https://myblhub.com";

/** Телеграм владельца — на случай, если вопрос срочный и лично. */
const OWNER_CONTACT = "@keetmine";

/**
 * Метка адресата в пересланном обращении. По ней ответ админа находит
 * дорогу обратно: другого способа нет — Telegram в reply отдаёт только
 * текст исходного сообщения, а не то, о ком оно было.
 */
const FROM_ID_MARK = /\(id (\d+)\)/;

/**
 * Кому адресован ответ админа: достаёт id из текста пересланного
 * обращения, на которое он ответил.
 *
 * Вынесено отдельно, потому что ломается тут ровно одно место — формат
 * пересылки. Поменяют строку в notifyAdmins, забыв про метку, и ответы
 * молча перестанут доходить: проверить это можно только так.
 */
export function replyTargetFromForwarded(text: string | undefined): string | null {
  return text?.match(FROM_ID_MARK)?.[1] ?? null;
}

/** Ответы на команды. Бот молчал на любой текст — для платёжного бота
 *  это прямое нарушение требований Telegram, да и человеку непонятно. */
const COMMAND_REPLIES: Record<string, string> = {
  "/start":
    `Привет! Это бот <b>MyBLHub</b> — трекера концертов и фанмитов тайских актёров.\n\n` +
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
  const rawText = update.message?.text?.trim();
  const command = rawText?.split(/\s+/)[0].toLowerCase();
  const chatId = update.message?.chat?.id ?? update.message?.from?.id;
  if (command && chatId && COMMAND_REPLIES[command]) {
    await sendTelegramMessage(String(chatId), COMMAND_REPLIES[command]).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  // Ответ администратора человеку. Раньше ответить было нельзя вовсе:
  // написанное в чат с ботом уходило боту как новое обращение — и
  // возвращалось админу же, потому что он и есть получатель обращений.
  //
  // Теперь работает штатный «Ответить» в Telegram: в апдейте приходит
  // reply_to_message с текстом пересланного обращения, оттуда достаём
  // id адресата.
  const replyTo = update.message?.reply_to_message?.text;
  if (rawText && chatId && replyTo) {
    const target = replyTargetFromForwarded(replyTo);
    if (target) {
      const admin = await prisma.user.findFirst({
        where: { isAdmin: true, telegramId: String(chatId) },
        select: { id: true },
      });
      // Отвечать людям от имени сервиса может только админ: без этой
      // проверки любой, кому переслали обращение, писал бы от нас.
      if (admin) {
        const delivered = await sendTelegramMessage(
          target,
          `💬 Ответ от MyBLHub:\n\n${rawText}`,
        ).catch(() => false);
        await sendTelegramMessage(
          String(chatId),
          delivered
            ? "Отправлено."
            : "Не дошло: человек мог закрыть чат с ботом или заблокировать его.",
        ).catch(() => {});
        return NextResponse.json({ ok: true });
      }
    }
  }

  // Любой другой текст — это человек, который пишет боту как живому
  // адресату (чаще всего просьба про подписку). Бот отвечать не умеет,
  // поэтому пересылаем админам и подтверждаем отправителю, что
  // сообщение дошло — иначе оно просто пропадало.
  if (rawText && chatId) {
    const from = update.message?.from;
    const who = from?.username ? `@${from.username}` : (from?.first_name ?? String(chatId));
    await notifyAdmins(
      "feedback",
      `✉️ Сообщение боту от ${who} (id ${chatId}):\n\n${rawText.slice(0, 800)}` +
        "\n\nЧтобы ответить — «Ответить» на это сообщение.",
    );
    await sendTelegramMessage(
      String(chatId),
      "Спасибо! Сообщение у нас — ответим здесь же или на сайте. " +
        `Если вопрос про подписку, можно сразу написать напрямую: ${APP_URL}/help ` +
        `или ${OWNER_CONTACT}`,
    ).catch(() => {});
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
