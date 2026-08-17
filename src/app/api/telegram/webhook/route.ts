import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { answerPreCheckoutQuery, sendTelegramMessage } from "@/lib/telegram";
import { extendPremium } from "@/lib/premium";

// Вебхук Telegram-бота — регистрируется скриптом
// scripts/setup-telegram-webhook.ts (setWebhook с secret_token). Пока
// обрабатывает только оплату подписки Stars: pre_checkout_query
// подтверждаем, successful_payment зачисляем по payload (наш userId,
// заложен в инвойс createPremiumInvoiceLink).
type TelegramUpdate = {
  pre_checkout_query?: { id: string; invoice_payload: string };
  message?: {
    from?: { id: number };
    successful_payment?: {
      invoice_payload: string;
      total_amount: number;
      telegram_payment_charge_id: string;
    };
  };
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
