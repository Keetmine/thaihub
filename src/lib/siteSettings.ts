import { prisma } from "@/lib/prisma";
import { PREMIUM_PRICE_STARS } from "@/lib/telegram";

// Настройки сайта (ключ-значение, правятся в /admin/settings без
// деплоя). Известные ключи перечислены здесь же, чтобы страница
// настроек и потребители не разъезжались.

/** Разделы страницы настроек: одним списком они читались как свалка,
 *  а по смыслу это две разные темы — деньги и оповещения. */
export const SETTING_GROUPS = [
  {
    key: "subscription",
    title: "Подписка и оплата",
    hint: "Цена, способ оплаты и текст пейволла.",
  },
  {
    key: "notifications",
    title: "Уведомления администраторам",
    hint: "О чём сообщать и куда.",
  },
] as const;

export type SettingGroup = (typeof SETTING_GROUPS)[number]["key"];

export const SETTING_KEYS = [
  {
    key: "premium_price_stars",
    group: "subscription",
    label: "Цена подписки (Stars, за месяц)",
    hint: `По умолчанию ${PREMIUM_PRICE_STARS} (env PREMIUM_PRICE_STARS)`,
  },
  {
    key: "paywall_title",
    group: "subscription",
    label: "Заголовок пейволла",
    hint: "По умолчанию «Афиша событий — по подписке»",
  },
  {
    key: "admin_notify_kinds",
    group: "notifications",
    label: "Уведомления админам в Telegram",
    hint:
      "Через запятую: feedback, report, import, error, payment, signup. " +
      "По умолчанию всё, кроме error. Пустая строка выключает совсем.",
  },
  {
    key: "payment_mode",
    group: "subscription",
    label: "Способ оплаты подписки",
    hint:
      "stars — кнопка оплаты через Telegram Stars; promo — оплата " +
      "договорная: кнопка «Написать в Telegram» и поле промокода. " +
      "По умолчанию promo (Stars недоступны в Беларуси).",
  },
  {
    key: "subscription_contact",
    group: "subscription",
    label: "Telegram для заявок на подписку",
    hint: "Ник без @ — на него ведёт кнопка «Написать в Telegram» на пейволле.",
  },
  {
    key: "admin_notify_email",
    group: "notifications",
    label: "Почта для тех же уведомлений",
    hint: "Работает только когда настроен SMTP (SMTP_HOST/SMTP_FROM)",
  },
] as const;

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.siteSetting.findUnique({ where: { key } });
  return row?.value ?? null;
}

/** Пишет значение по ключу. Ключи не из SETTING_KEYS на /admin/settings
 *  не показываются — так хранится и служебное состояние вроде последней
 *  обработанной ревизии вики-страницы маскотов (gmmtvMascots.ts):
 *  строка одна, и отдельная таблица ради неё не нужна. */
export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.siteSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function getPremiumPriceStars(): Promise<number> {
  const raw = await getSetting("premium_price_stars");
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : PREMIUM_PRICE_STARS;
}

/** Как сейчас продаётся подписка. Оплата Stars привязана к стране
 *  владельца бота и может быть недоступна — тогда пейволл не должен
 *  вести в ошибку Telegram, а честно звать написать нам. */
export async function getPaymentMode(): Promise<"stars" | "promo"> {
  // По умолчанию promo: приём Stars привязан к стране владельца бота и
  // сейчас недоступен — кнопка оплаты вела бы прямо в ошибку Telegram.
  return (await getSetting("payment_mode")) === "stars" ? "stars" : "promo";
}

/** Ник в Telegram, куда идут заявки на подписку (без @). */
export async function getSubscriptionContact(): Promise<string | null> {
  const raw = (await getSetting("subscription_contact"))?.trim().replace(/^@/, "");
  return raw || null;
}
