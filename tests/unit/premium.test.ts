import assert from "node:assert/strict";
import {
  FREE_ACCESS,
  hasPaidPremium,
  isPremiumActive,
  extendPremium,
  premiumAccessWhere,
  premiumActiveWhere,
  premiumInactiveWhere,
  PREMIUM_TERM_DAYS,
} from "../../src/lib/premium";

// Активность подписки (src/lib/premium.ts): срок в будущем ИЛИ бессрочный
// флаг. Только чистые функции — без БД. Запуск:
//
//   npx tsx tests/unit/premium.test.ts
//
// Проверок две пары, и путать их нельзя:
//   hasPaidPremium / premiumActiveWhere — ОПЛАЧЕНО (бейджи, счётчики);
//   isPremiumActive / premiumAccessWhere — ДОСТУПНО (гейты), а в
//   промо-период (FREE_ACCESS) доступно всем залогиненным.
// Поэтому «доступно» проверяется с оглядкой на флаг: тест должен
// оставаться зелёным и когда промо выключат.

const DAY = 24 * 60 * 60 * 1000;
const future = new Date(Date.now() + 10 * DAY);
const past = new Date(Date.now() - 10 * DAY);

// --- hasPaidPremium: реально оплаченная подписка ---
// Промо на неё не влияет вовсе — иначе звезда подписчика загорится у
// всех и перестанет что-либо значить.

assert.equal(hasPaidPremium(null), false, "нет пользователя");
assert.equal(hasPaidPremium(undefined), false, "нет пользователя (undefined)");
assert.equal(hasPaidPremium({ premiumUntil: null, premiumLifetime: false }), false, "подписки не было");
assert.equal(hasPaidPremium({ premiumUntil: past, premiumLifetime: false }), false, "срок истёк");
assert.equal(hasPaidPremium({ premiumUntil: future, premiumLifetime: false }), true, "срок в будущем");
assert.equal(hasPaidPremium({ premiumUntil: null, premiumLifetime: true }), true, "бессрочная без срока");
assert.equal(hasPaidPremium({ premiumUntil: past, premiumLifetime: true }), true, "бессрочная с истёкшим сроком");
assert.equal(hasPaidPremium({ premiumUntil: future, premiumLifetime: true }), true, "бессрочная поверх срока");

// --- isPremiumActive: доступ к платному ---

// Гость — всегда мимо, и в промо тоже: личные разделы без аккаунта не
// работают. Это главное, что промо НЕ должно было сломать.
assert.equal(isPremiumActive(null), false, "гость не получает платное даже в промо");
assert.equal(isPremiumActive(undefined), false, "гость (undefined) не получает платное");

// Оплатившему доступно при любом значении флага.
assert.equal(isPremiumActive({ premiumUntil: future, premiumLifetime: false }), true, "срок в будущем");
assert.equal(isPremiumActive({ premiumUntil: null, premiumLifetime: true }), true, "бессрочная");

// А неоплатившему — только пока идёт промо.
assert.equal(
  isPremiumActive({ premiumUntil: null, premiumLifetime: false }),
  FREE_ACCESS,
  "без подписки доступ есть ровно в промо-период",
);
assert.equal(
  isPremiumActive({ premiumUntil: past, premiumLifetime: false }),
  FREE_ACCESS,
  "истёкшая подписка — то же самое",
);

// --- premiumActiveWhere / premiumInactiveWhere ---
// Условия для Prisma должны повторять hasPaidPremium: бессрочные попадают
// в «активные» и не попадают в «без подписки».

const now = new Date();
assert.deepEqual(premiumActiveWhere(now), {
  OR: [{ premiumLifetime: true }, { premiumUntil: { gt: now } }],
});
assert.deepEqual(premiumInactiveWhere(now), {
  premiumLifetime: false,
  OR: [{ premiumUntil: null }, { premiumUntil: { lte: now } }],
});

// --- premiumAccessWhere: пара к isPremiumActive ---
// В промо условия нет вовсе (подходят все, кого отобрали остальные
// фильтры), вне промо — ровно premiumActiveWhere.
assert.deepEqual(
  premiumAccessWhere(now),
  FREE_ACCESS ? {} : premiumActiveWhere(now),
  "выборка доступа следует за флагом промо",
);

// --- extendPremium ---

const fromExpired = extendPremium(past);
assert.ok(
  Math.abs(fromExpired.getTime() - (Date.now() + PREMIUM_TERM_DAYS * DAY)) < 60_000,
  "истёкший срок продлевается от сегодня",
);
const fromActive = extendPremium(future);
assert.equal(
  fromActive.getTime(),
  new Date(future.getTime() + PREMIUM_TERM_DAYS * DAY).getTime(),
  "активный срок продлевается от своего конца",
);

console.log("premium.test.ts: ok");
