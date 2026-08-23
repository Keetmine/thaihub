import "dotenv/config";
import { prisma } from "../../src/lib/prisma";

// Уборка за create-promo-code.ts: использованный код остаётся строкой в
// PromoCode (удаление тестового юзера лишь обнуляет usedById через
// SetNull), поэтому его нужно удалить отдельным шагом.
const code = process.argv[2];
if (!code) throw new Error("usage: tsx delete-promo-code.ts <code>");

prisma.promoCode
  .deleteMany({ where: { code } })
  .finally(() => prisma.$disconnect());
