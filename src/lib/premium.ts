// Подписка — это срок (premiumUntil), а не вечный флаг: активна, пока
// дата в будущем. Все гейты проверяют через этот хелпер, чтобы логика
// истечения жила в одном месте.
export function isPremiumActive(user: { premiumUntil: Date | null } | null | undefined): boolean {
  return !!user?.premiumUntil && user.premiumUntil > new Date();
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
