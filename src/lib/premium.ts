import type { Prisma } from "@/generated/prisma/client";

/** Поля User, по которым решается, активна ли подписка. Оба обязательны
 *  нарочно: выборка с одним premiumUntil (без premiumLifetime) молча
 *  считала бы бессрочных подписчиков базовыми — пусть это ловит
 *  компилятор, а не жалоба пользователя. */
export type PremiumFields = { premiumUntil: Date | null; premiumLifetime: boolean };

/**
 * ПРОМО-ПЕРИОД: весь платный функционал открыт любому залогиненному
 * (решение владельца 2026-09-15). Подписку ещё не продаём, а держать
 * половину сайта за стеной, которую нельзя оплатить, — обман: человек
 * упирается в пейволл и уходит, ничего не купив, потому что купить
 * негде.
 *
 * Открыто ИМЕННО ДЛЯ АККАУНТОВ, не для гостей: личные разделы (поездки,
 * списки, отметки) без пользователя работать не умеют, и `isPremiumActive`
 * ниже по-прежнему первым делом отвечает `false` на `null`.
 *
 * Выключается сменой этой константы на `false` — и сайт возвращается
 * ровно к прежнему поведению, гейты не трогали. Не настройка в БД
 * нарочно: `isPremiumActive` синхронная и зовётся из семидесяти мест,
 * асинхронный флаг переписал бы половину из них ради переключателя,
 * который дёргают раз в полгода.
 *
 * Что промо НЕ трогает: бейджи подписчика (см. `hasPaidPremium`),
 * счётчики в админке и выбор аудитории рассылки — они про «кто реально
 * заплатил», а не про «кому что доступно».
 */
export const FREE_ACCESS = true;

/**
 * РЕАЛЬНО оплаченная подписка: срок (`premiumUntil`) в будущем либо
 * бессрочная (`premiumLifetime`, её выдаёт админ друзьям и команде).
 *
 * Это про СТАТУС, а не про доступ. Отсюда питаются вещи, которые в
 * промо-период обязаны остаться честными: звезда у имени в профиле,
 * цветная обводка аватарки, «Базовый» у себя, счётчики подписчиков в
 * админке. Если спросить тут `isPremiumActive`, во время промо звезда
 * загорится у всех — и перестанет что-либо значить.
 *
 * Гейты доступа сюда НЕ ходят: им нужен `isPremiumActive`.
 */
export function hasPaidPremium(user: PremiumFields | null | undefined): boolean {
  if (!user) return false;
  if (user.premiumLifetime) return true;
  return !!user.premiumUntil && user.premiumUntil > new Date();
}

/**
 * Доступен ли человеку платный функционал. ЕДИНСТВЕННАЯ проверка во
 * всех гейтах — логика истечения (и промо-периода) живёт в одном месте.
 *
 * Гость — всегда `false`: см. оговорку у `FREE_ACCESS`.
 */
export function isPremiumActive(user: PremiumFields | null | undefined): boolean {
  if (!user) return false;
  if (FREE_ACCESS) return true;
  return hasPaidPremium(user);
}

/** То же условие для Prisma-выборок (счётчики, рассылки, фильтр в
 *  админке): активна бессрочная ИЛИ срок в будущем.
 *
 *  ВНИМАНИЕ: это ОПЛАЧЕННАЯ подписка, пара к `hasPaidPremium`, и промо
 *  на неё не распространяется. Для выборок «кому доступна платная
 *  функция» есть `premiumAccessWhere`. */
export function premiumActiveWhere(now = new Date()): Prisma.UserWhereInput {
  return { OR: [{ premiumLifetime: true }, { premiumUntil: { gt: now } }] };
}

/** Выборка «кому доступна платная функция» — пара к `isPremiumActive`,
 *  для рассылок и подборок. В промо-период условия нет вовсе: подходят
 *  все, кого отобрали остальные фильтры (привязанный Telegram, включённый
 *  тумблер и т.п.). Без этого недельный дайджест остался бы единственной
 *  функцией, которую открыли на словах и не открыли на деле. */
export function premiumAccessWhere(now = new Date()): Prisma.UserWhereInput {
  return FREE_ACCESS ? {} : premiumActiveWhere(now);
}

/** Обратное условие: не бессрочная И срок пустой или истёк. */
export function premiumInactiveWhere(now = new Date()): Prisma.UserWhereInput {
  return { premiumLifetime: false, OR: [{ premiumUntil: null }, { premiumUntil: { lte: now } }] };
}

// Пробный лимит вместо глухого пейволла (аудит 2026-09 п.8, решение
// владельца): бесплатному аккаунту — ОДНА поездка и ОДИН свой список
// мест, чтобы пощупать фичу до подписки. Считается по владельцу
// (count < лимита), сами константы живут тут, рядом с isPremiumActive:
// гейты в trips/lists сверяются с ними, а не с зашитой единицей.
// У активной подписки лимитов нет.
export const FREE_TRIP_LIMIT = 1;
export const FREE_PLACE_LIST_LIMIT = 1;

export const PREMIUM_TERM_DAYS = 30;

export function extendPremium(current: Date | null): Date {
  // Продление складывается: если подписка ещё активна — плюс месяц к её
  // концу, если истекла — месяц от сегодня.
  const base = current && current > new Date() ? current : new Date();
  const next = new Date(base);
  next.setDate(next.getDate() + PREMIUM_TERM_DAYS);
  return next;
}
