import "dotenv/config";
import { randomBytes } from "crypto";
import { prisma } from "../../src/lib/prisma";

// Out-of-process по той же причине, что cleanup-test-user.ts (ESM-only
// Prisma-клиент). Печатает свежий инвайт-код — регистрация теперь только
// по кодам.
const code = `E2E-${randomBytes(4).toString("hex").toUpperCase()}`;
prisma.inviteCode
  .create({ data: { code } })
  .then(() => console.log(code))
  .finally(() => prisma.$disconnect());
