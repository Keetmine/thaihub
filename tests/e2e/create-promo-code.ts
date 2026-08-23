import "dotenv/config";
import { prisma } from "../../src/lib/prisma";

// Out-of-process по той же причине, что cleanup-test-user.ts (ESM-only
// Prisma-клиент). Создаёт неиспользованный промокод подписки для теста
// активации; если код уже существует (прошлый прогон упал до уборки) —
// сбрасывает его в свежее неиспользованное состояние.
const code = process.argv[2];
const months = Number(process.argv[3] ?? "1");
if (!code || !Number.isFinite(months) || months < 1) {
  throw new Error("usage: tsx create-promo-code.ts <code> [months]");
}

prisma.promoCode
  .upsert({
    where: { code },
    create: { code, months },
    update: { months, usedAt: null, usedById: null },
  })
  .finally(() => prisma.$disconnect());
