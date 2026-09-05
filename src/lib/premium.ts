import type { Prisma } from "@/generated/prisma/client";

/** Поля User, по которым решается, активна ли подписка. Оба обязательны
 *  нарочно: выборка с одним premiumUntil (без premiumLifetime) молча
 *  считала бы бессрочных подписчиков базовыми — пусть это ловит
 *  компилятор, а не жалоба пользователя. */
export type PremiumFields = { premiumUntil: Date | null; premiumLifetime: boolean };

// Подписка — это срок (premiumUntil), а не вечный флаг: активна, пока
// дата в будущем. Исключение — бессрочная (premiumLifetime): её выдаёт
// админ друзьям и команде, чтобы не продлевать каждый месяц, и она
// активна без оглядки на срок. Все гейты проверяют через этот хелпер,
// чтобы логика истечения жила в одном месте.
export function isPremiumActive(user: PremiumFields | null | undefined): boolean {
  if (!user) return false;
  if (user.premiumLifetime) return true;
  return !!user.premiumUntil && user.premiumUntil > new Date();
}

/** То же условие для Prisma-выборок (счётчики, рассылки, фильтр в
 *  админке): активна бессрочная ИЛИ срок в будущем. */
export function premiumActiveWhere(now = new Date()): Prisma.UserWhereInput {
  return { OR: [{ premiumLifetime: true }, { premiumUntil: { gt: now } }] };
}

/** Обратное условие: не бессрочная И срок пустой или истёк. */
export function premiumInactiveWhere(now = new Date()): Prisma.UserWhereInput {
  return { premiumLifetime: false, OR: [{ premiumUntil: null }, { premiumUntil: { lte: now } }] };
}

export const PREMIUM_TERM_DAYS = 30;

export function extendPremium(current: Date | null): Date {
  // Продление складывается: если подписка ещё активна — плюс месяц к её
  // концу, если истекла — месяц от сегодня.
  const base = current && current > new Date() ? current : new Date();
  const next = new Date(base);
  next.setDate(next.getDate() + PREMIUM_TERM_DAYS);
  return next;
}
