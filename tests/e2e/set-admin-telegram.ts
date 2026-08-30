import "dotenv/config";
import { prisma } from "../../src/lib/prisma";
import { ADMIN_EMAIL } from "./helpers";
import { FAKE_TELEGRAM_ID } from "./testAuditFixtures";

/**
 * `tsx set-admin-telegram.ts on|off` — «привязывает»/отвязывает Telegram
 * тестовому админу.
 *
 * Переключатели «Присылать в Telegram» (в том числе tgNotifyEpisodes)
 * рисуются в настройках только у аккаунта с привязанным ботом — без
 * этого проверять в форме нечего. Номер фиктивный и живёт ровно на
 * время одного теста: спека снимает его в finally, потому что с ним
 * приложение попыталось бы слать реальные сообщения в несуществующий
 * чат.
 */
async function main() {
  const mode = process.argv[2];
  if (mode !== "on" && mode !== "off") {
    throw new Error("usage: tsx set-admin-telegram.ts on|off");
  }
  await prisma.user.updateMany({
    where: { email: ADMIN_EMAIL },
    data:
      mode === "on"
        ? { telegramId: FAKE_TELEGRAM_ID, telegramUsername: "e2e_admin_bot_link" }
        : { telegramId: null, telegramUsername: null },
  });
  console.log(`telegram ${mode}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
