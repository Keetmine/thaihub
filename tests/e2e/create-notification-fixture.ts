import "dotenv/config";
import { prisma } from "../../src/lib/prisma";
import { ADMIN_EMAIL } from "./helpers";
import { CLICK_NOTIFICATION } from "./testNotificationFixture";

/**
 * Одно НЕПРОЧИТАННОЕ уведомление тестовому админу — для
 * notification-click-read.spec.ts. Отдельным tsx-процессом (Prisma в
 * спеки не импортировать, см. docs/testing.md). Идемпотентно: свои
 * прежние строки (по метке actorName) сначала убирает, чтобы повторный
 * прогон не плодил вторые и не находил уже прочитанную.
 */
async function main() {
  const admin = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
    select: { id: true },
  });
  if (!admin) {
    throw new Error(
      `нет тестового админа ${ADMIN_EMAIL} — сначала должен пройти setup-проект ` +
        `(npx playwright test --project=setup), он же его и заводит`,
    );
  }

  await prisma.notification.deleteMany({
    where: { userId: admin.id, actorName: CLICK_NOTIFICATION.actorName },
  });
  await prisma.notification.create({
    data: {
      userId: admin.id,
      kind: CLICK_NOTIFICATION.kind,
      actorName: CLICK_NOTIFICATION.actorName,
      title: CLICK_NOTIFICATION.title,
      href: CLICK_NOTIFICATION.href,
    },
  });

  console.log("ok");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
