import { prisma } from "@/lib/prisma";
import { PREMIUM_PRICE_STARS } from "@/lib/telegram";

// Настройки сайта (ключ-значение, правятся в /admin/settings без
// деплоя). Известные ключи перечислены здесь же, чтобы страница
// настроек и потребители не разъезжались.

export const SETTING_KEYS = [
  {
    key: "premium_price_stars",
    label: "Цена подписки (Stars, за месяц)",
    hint: `По умолчанию ${PREMIUM_PRICE_STARS} (env PREMIUM_PRICE_STARS)`,
  },
  {
    key: "paywall_title",
    label: "Заголовок пейволла",
    hint: "По умолчанию «Афиша событий — по подписке»",
  },
  {
    key: "admin_notify_kinds",
    label: "Уведомления админам в Telegram",
    hint:
      "Через запятую: feedback, report, import, error, payment. " +
      "По умолчанию всё, кроме error. Пустая строка выключает совсем.",
  },
  {
    key: "admin_notify_email",
    label: "Почта для тех же уведомлений",
    hint: "Работает только когда настроен SMTP (SMTP_HOST/SMTP_FROM). Пусто — не слать.",
  },
] as const;

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.siteSetting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function getPremiumPriceStars(): Promise<number> {
  const raw = await getSetting("premium_price_stars");
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : PREMIUM_PRICE_STARS;
}
