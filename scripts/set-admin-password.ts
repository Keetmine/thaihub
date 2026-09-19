import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/userAuth";

// Делает пользователя админом и ставит ему пароль (создаёт, если нет).
// Нужен на локали: после заливки прод-дампа пароли там — scrypt-хеши,
// восстановить их нельзя, а войти в админку надо.
//
//   npx tsx scripts/set-admin-password.ts <e-mail> новый-пароль
async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error("usage: npx tsx scripts/set-admin-password.ts <email> <password>");
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production") {
    console.error("refusing to run in production");
    process.exit(1);
  }
  const passwordHash = hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash, name: email.split("@")[0], isAdmin: true, tourCompletedAt: new Date() },
    update: { passwordHash, isAdmin: true },
  });
  console.log(`ok: ${user.email} isAdmin=${user.isAdmin} id=${user.id}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
