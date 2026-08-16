import "dotenv/config";
import { prisma } from "../../src/lib/prisma";
import { hashPassword } from "../../src/lib/userAuth";

// Создаёт/обновляет тестового админа для e2e (см. helpers.loginAsAdmin) —
// отдельного админ-логина нет, админ это роль пользователя.
async function main() {
  await prisma.user.upsert({
    where: { email: "admin-e2e@test.local" },
    create: {
      email: "admin-e2e@test.local",
      passwordHash: hashPassword("admin-e2e-password"),
      name: "E2E Admin",
      isAdmin: true,
    },
    update: { isAdmin: true, passwordHash: hashPassword("admin-e2e-password") },
  });
  console.log("ok");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
