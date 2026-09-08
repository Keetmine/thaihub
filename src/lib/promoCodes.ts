import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * Одноразовый подарочный промокод подписки (модель PromoCode, активация
 * полем «Промокод» на пейволле — см. promoActions.ts). Генератор один
 * на оба места, где коды рождаются, — админку (/admin/users) и покупку
 * «подарить подписку» за Stars (вебхук Telegram): формат и стойкость
 * кода не должны разъезжаться.
 *
 * 8 байт случайности: 4 байта (~4 млрд вариантов) уже можно было
 * перебирать онлайн через форму активации — 16 hex-символов перебором
 * не достать.
 */
export async function createGiftPromoCode(months = 1): Promise<string> {
  const code = `GIFT-${randomBytes(8).toString("hex").toUpperCase()}`;
  await prisma.promoCode.create({ data: { code, months } });
  return code;
}
