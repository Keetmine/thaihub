import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { GIFT_PAYLOAD_PREFIX, answerPreCheckoutQuery, sendTelegramMessage } from "@/lib/telegram";
import { formatFullDate } from "@/lib/dates";
import { extendPremium } from "@/lib/premium";
import { createGiftPromoCode } from "@/lib/promoCodes";
import { notifyAdmins } from "@/lib/adminNotify";
import { buildDigestMessage } from "@/lib/botDigest";

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

/** Сколько тишины превращает переписку в НОВЫЙ разговор (И7): пока обе
 *  стороны молчали меньше, автоподтверждение «сообщение у нас» не
 *  повторяется — человек его уже видел (или с ним уже говорит админ). */
const CONVERSATION_TTL_MS = 48 * 60 * 60 * 1000;

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
    `Привет! Это бот сайта <b>MyBLHub</b> — трекера концертов и фанмитов тайских актёров.\n\n` +
    `Я присылаю напоминания о событиях из избранного, сигналы о старте продаж билетов и новости друзей.\n\n` +
    `Сайт: ${APP_URL}\n` +
    `Команды: /today — что у вас сегодня, /week — что на неделе, ` +
    `/terms — условия, /support — поддержка`,
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
    // У подарочного инвойса payload с префиксом (см. GIFT_PAYLOAD_PREFIX
    // в lib/telegram.ts) — покупателя ищем по остатку, иначе подарок
    // упирался бы в «Аккаунт не найден» и оплата не проходила.
    const buyerId = invoice_payload.startsWith(GIFT_PAYLOAD_PREFIX)
      ? invoice_payload.slice(GIFT_PAYLOAD_PREFIX.length)
      : invoice_payload;
    const user = await prisma.user.findUnique({ where: { id: buyerId } });
    await answerPreCheckoutQuery(id, !!user, user ? undefined : "Аккаунт не найден");
    return NextResponse.json({ ok: true });
  }

  // Команды: отвечаем и выходим — оплата этим же апдейтом не приходит.
  // Суффикс «@ИмяБота» (так Telegram шлёт команды из групповых чатов)
  // отрезаем — иначе «/today@бот» молча падал бы в ветку фидбэка.
  const rawText = update.message?.text?.trim();
  const command = rawText?.split(/\s+/)[0].toLowerCase().split("@")[0];
  const chatId = update.message?.chat?.id ?? update.message?.from?.id;
  if (command && chatId && COMMAND_REPLIES[command]) {
    await sendTelegramMessage(String(chatId), COMMAND_REPLIES[command]).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  // /today и /week — личная подборка (аудит 2026-09, раздел 7): серии
  // моих сериалов, мои события, дни рождения избранных. Аккаунт ищем по
  // отправителю (from.id), а не по чату: в личке это одно и то же, а
  // командам из группового чата чужая подборка не положена.
  if (command === "/today" || command === "/week") {
    const senderId = update.message?.from?.id ?? chatId;
    if (!senderId || !chatId) return NextResponse.json({ ok: true });
    const linked = await prisma.user.findFirst({
      where: { telegramId: String(senderId) },
      select: { id: true, locale: true },
    });
    if (!linked) {
      // Непривязанному подборку собрать не из чего — подсказываем, где
      // привязать. По-русски, как остальные ответы бота: язык человека
      // без аккаунта нам неоткуда узнать.
      await sendTelegramMessage(
        String(chatId),
        `Подборка работает с привязанным аккаунтом MyBLHub.\n` +
          `Привяжите Telegram на сайте: Настройки → Профиль → блок «Telegram».\n` +
          `${APP_URL}/account/settings`,
      ).catch(() => {});
    } else {
      const digest = await buildDigestMessage(linked, command === "/today" ? 1 : 7);
      await sendTelegramMessage(String(chatId), digest).catch(() => {});
    }
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
        // Разговор стал живым: следующие сообщения человека идут без
        // автоподтверждения — на них отвечает админ, а не автомат.
        if (delivered) {
          const now = new Date();
          await prisma.telegramChatState
            .upsert({
              where: { chatId: target },
              create: { chatId: target, lastUserMessageAt: now, lastAdminReplyAt: now },
              update: { lastAdminReplyAt: now },
            })
            .catch(() => {});
        }
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
  // адресату (чаще всего просьба про подписку). Пересылаем админам, а
  // отправителю подтверждаем получение — но один раз в начале
  // разговора, а не на каждое сообщение (И7): три строки подряд
  // получали три одинаковых «Спасибо!», и бот выглядел автоответчиком,
  // которому всё равно, что ему пишут. После ответа админа
  // автоподтверждений нет вовсе — это уже живой диалог.
  if (rawText && chatId) {
    const from = update.message?.from;
    const who = from?.username ? `@${from.username}` : (from?.first_name ?? String(chatId));
    await notifyAdmins(
      "feedback",
      `✉️ Сообщение боту от ${who} (id ${chatId}):\n\n${rawText.slice(0, 800)}` +
        "\n\nЧтобы ответить — «Ответить» на это сообщение.",
    );

    const id = String(chatId);
    const now = new Date();
    const state = await prisma.telegramChatState.findUnique({ where: { chatId: id } });
    // Разговор «живой», пока с последней реплики любой стороны прошло
    // меньше CONVERSATION_TTL_MS; вернувшемуся после паузы человеку
    // подтверждение уместно снова — его вопрос наверняка новый.
    const lastActivityMs = state
      ? Math.max(state.lastUserMessageAt.getTime(), state.lastAdminReplyAt?.getTime() ?? 0)
      : null;
    const isNewConversation =
      lastActivityMs === null || now.getTime() - lastActivityMs > CONVERSATION_TTL_MS;
    await prisma.telegramChatState
      .upsert({
        where: { chatId: id },
        create: { chatId: id, lastUserMessageAt: now },
        update: { lastUserMessageAt: now },
      })
      .catch(() => {});
    if (isNewConversation) {
      await sendTelegramMessage(
        id,
        // Личного телеграма владельца тут больше нет (правка
        // 2026-09-15): за сайтом не должно быть видно конкретного
        // человека. Форма обращения и так приходит в этот же чат.
        "Спасибо! Сообщение у нас — ответим здесь же или на сайте. " +
          `Если вопрос про подписку, напишите через форму: ${APP_URL}/help`,
      ).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  }

  const payment = update.message?.successful_payment;
  if (payment) {
    // Подарочная покупка (аудит 2026-09 п.8): payload с префиксом. Не
    // продлеваем подписку покупателю, а создаём одноразовый промокод и
    // шлём его покупателю сюда же, в чат с ботом, — открыткой для
    // пересылки. Показать код на сайте в момент покупки нельзя: оплата
    // приходит асинхронно вебхуком, а чат, из которого заплатили,
    // всегда под рукой — и переслать оттуда проще всего.
    const isGift = payment.invoice_payload.startsWith(GIFT_PAYLOAD_PREFIX);
    const payloadUserId = isGift
      ? payment.invoice_payload.slice(GIFT_PAYLOAD_PREFIX.length)
      : payment.invoice_payload;
    if (isGift) {
      const buyer = await prisma.user.findUnique({ where: { id: payloadUserId } });
      if (!buyer) {
        console.warn(`gift payment for unknown user payload: ${payment.invoice_payload}`);
        return NextResponse.json({ ok: true });
      }
      // Дедуп ретраев вебхука ДО генерации: у обычной оплаты upsert по
      // charge id спасает журнал, но здесь ретрай наплодил бы вторые
      // промокоды — проверяем журнал заранее и выходим.
      const already = await prisma.payment.findUnique({
        where: { telegramChargeId: payment.telegram_payment_charge_id },
      });
      if (already) return NextResponse.json({ ok: true });

      const code = await createGiftPromoCode();
      // Журнал оплат (/admin/finance) — строка покупателя, как у
      // обычной подписки: звёзды заплатил он.
      await prisma.payment.create({
        data: {
          userId: buyer.id,
          amount: payment.total_amount,
          telegramChargeId: payment.telegram_payment_charge_id,
        },
      });
      console.log(
        `gift payment: buyer ${buyer.id}, charge ${payment.telegram_payment_charge_id}, code ${code}`,
      );
      await notifyAdmins(
        "payment",
        `🎁 Подарочная подписка: ${buyer.name ?? buyer.email ?? buyer.id}, ${payment.total_amount} Stars. Код ${code}.`,
      );
      if (update.message?.from) {
        const chatId = String(update.message.from.id);
        // Два сообщения: короткое «готово» покупателю и отдельная
        // самодостаточная открытка — её пересылают как есть, и в ней
        // не должно быть служебного «перешлите подруге».
        await sendTelegramMessage(
          chatId,
          "✅ Оплачено! Ниже — открытка с промокодом: перешлите её тому, кому дарите. Код одноразовый.",
        ).catch(() => {});
        await sendTelegramMessage(
          chatId,
          `🎁 Вам дарят месяц подписки <b>MyBLHub</b>!\n\n` +
            `Промокод: <code>${code}</code>\n\n` +
            `Как активировать: войдите на ${APP_URL} и введите код в поле «Промокод» на странице подписки — 30 дней откроются сразу.`,
        ).catch(() => {});
      }
      return NextResponse.json({ ok: true });
    }

    const user = await prisma.user.findUnique({ where: { id: payloadUserId } });
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
          `✅ Подписка MyBLHub активна до ${formatFullDate(until)}. Спасибо!`,
        ).catch(() => {});
      }
    } else {
      console.warn(`premium payment for unknown user payload: ${payment.invoice_payload}`);
    }
  }

  return NextResponse.json({ ok: true });
}
