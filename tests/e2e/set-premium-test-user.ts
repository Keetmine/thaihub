import "dotenv/config";
import { prisma } from "../../src/lib/prisma";

// Out-of-process по той же причине, что cleanup-test-user.ts (ESM-only
// Prisma-клиент). Включает подписку тестовому юзеру — события целиком за
// подпиской, без неё смоук избранного не увидел бы ни одной ссылки.
const email = process.argv[2];
if (!email) throw new Error("usage: tsx set-premium-test-user.ts <email>");

prisma.user
  .updateMany({
    where: { email },
    data: { premiumUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
  })
  .finally(() => prisma.$disconnect());
