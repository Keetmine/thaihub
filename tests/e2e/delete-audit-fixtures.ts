import "dotenv/config";
import { prisma } from "../../src/lib/prisma";
import { ADMIN_EMAIL } from "./helpers";
import {
  DL_TRANSLATED,
  DL_UNTRANSLATED,
  EPISODE_DRAMA,
  PHOTO_EVENT,
} from "./testAuditFixtures";

/**
 * Убираем за собой: база у разработчика — копия боевой, выдуманное
 * событие с сериалами там после прогона лишнее. Фото, даты, серии и
 * статусы просмотра уходят каскадом (onDelete: Cascade), а вот строка
 * в колокольчике на сериал не ссылается (название заморожено текстом) —
 * её удаляем отдельно, по поводу и названию.
 *
 * Подписка и «привязанный» Telegram админа — тоже наш след: их ставит
 * create-audit-fixtures.ts (и set-admin-telegram.ts), и оставлять их
 * после прогона нельзя — соседние спеки ждут обычного админа.
 */
async function main() {
  const dramas = await prisma.drama.deleteMany({
    where: {
      slug: { in: [EPISODE_DRAMA.slug, DL_TRANSLATED.slug, DL_UNTRANSLATED.slug] },
    },
  });
  const events = await prisma.event.deleteMany({ where: { slug: PHOTO_EVENT.slug } });
  const notifications = await prisma.notification.deleteMany({
    where: { kind: "EPISODE_AIRED", subject: EPISODE_DRAMA.title },
  });
  const admin = await prisma.user.updateMany({
    where: { email: ADMIN_EMAIL },
    data: { premiumUntil: null, telegramId: null, telegramUsername: null },
  });
  console.log(
    `удалено: сериалов ${dramas.count}, событий ${events.count}, ` +
      `уведомлений ${notifications.count}, админов сброшено ${admin.count}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
