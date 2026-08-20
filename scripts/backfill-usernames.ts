import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { suggestUsername, RESERVED_USERNAMES, isValidUsername } from "../src/lib/userProfile";

// Ники существующим пользователям: они появились позже регистрации, а
// без ника профиль недоступен по красивой ссылке (/users/keetmine).
// Берём Telegram-username, иначе часть почты, иначе имя; при совпадении
// добавляем номер.

async function main() {
  const users = await prisma.user.findMany({
    where: { username: null, deletedAt: null },
    select: { id: true, email: true, name: true, telegramUsername: true },
  });
  console.log(`без ника: ${users.length}`);

  const taken = new Set(
    (
      await prisma.user.findMany({
        where: { username: { not: null } },
        select: { username: true },
      })
    ).map((u) => u.username!),
  );

  for (const u of users) {
    const seed = u.telegramUsername || u.email || u.name || "user";
    const base = suggestUsername(seed);
    let candidate = base;
    let n = 1;
    while (taken.has(candidate) || RESERVED_USERNAMES.has(candidate) || !isValidUsername(candidate)) {
      n += 1;
      candidate = `${base}${n}`;
    }
    taken.add(candidate);
    await prisma.user.update({ where: { id: u.id }, data: { username: candidate } });
    console.log(`${u.email ?? u.telegramUsername ?? u.id} → ${candidate}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
