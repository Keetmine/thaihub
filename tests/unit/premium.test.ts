import assert from "node:assert/strict";
import {
  isPremiumActive,
  extendPremium,
  premiumActiveWhere,
  premiumInactiveWhere,
  PREMIUM_TERM_DAYS,
} from "../../src/lib/premium";

// Активность подписки (src/lib/premium.ts): срок в будущем ИЛИ бессрочный
// флаг. Только чистые функции — без БД. Запуск:
//
//   npx tsx tests/unit/premium.test.ts

const DAY = 24 * 60 * 60 * 1000;
const future = new Date(Date.now() + 10 * DAY);
const past = new Date(Date.now() - 10 * DAY);

// --- isPremiumActive ---

assert.equal(isPremiumActive(null), false, "нет пользователя");
assert.equal(isPremiumActive(undefined), false, "нет пользователя (undefined)");
assert.equal(isPremiumActive({ premiumUntil: null, premiumLifetime: false }), false, "подписки не было");
assert.equal(isPremiumActive({ premiumUntil: past, premiumLifetime: false }), false, "срок истёк");
assert.equal(isPremiumActive({ premiumUntil: future, premiumLifetime: false }), true, "срок в будущем");
assert.equal(isPremiumActive({ premiumUntil: null, premiumLifetime: true }), true, "бессрочная без срока");
assert.equal(isPremiumActive({ premiumUntil: past, premiumLifetime: true }), true, "бессрочная с истёкшим сроком");
assert.equal(isPremiumActive({ premiumUntil: future, premiumLifetime: true }), true, "бессрочная поверх срока");

// --- premiumActiveWhere / premiumInactiveWhere ---
// Условия для Prisma должны повторять isPremiumActive: бессрочные попадают
// в «активные» и не попадают в «без подписки».

const now = new Date();
assert.deepEqual(premiumActiveWhere(now), {
  OR: [{ premiumLifetime: true }, { premiumUntil: { gt: now } }],
});
assert.deepEqual(premiumInactiveWhere(now), {
  premiumLifetime: false,
  OR: [{ premiumUntil: null }, { premiumUntil: { lte: now } }],
});

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
