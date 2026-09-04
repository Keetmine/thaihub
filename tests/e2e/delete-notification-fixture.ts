import "dotenv/config";
import { prisma } from "../../src/lib/prisma";
import { ADMIN_EMAIL } from "./helpers";
import { CLICK_NOTIFICATION } from "./testNotificationFixture";

/** Убирает за notification-click-read.spec.ts его уведомление-фикстуру
 *  (по метке actorName). Чужие строки админа не трогает. */
async function main() {
  const admin = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
    select: { id: true },
  });
  if (admin) {
    await prisma.notification.deleteMany({
      where: { userId: admin.id, actorName: CLICK_NOTIFICATION.actorName },
    });
  }
  console.log("ok");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
