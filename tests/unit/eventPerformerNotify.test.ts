import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma";
import { notifyFavoritersAboutEventPerformers } from "../../src/lib/telegramNotifications";

// «У избранного артиста новое событие»: когда в составе и группа, и её
// участники, в фразу идёт только группа — «У LYKN, Lego и ещё 2 новое
// событие» выглядело так, будто выступают четыре разных артиста
// (правка владельца 2026-09-24). Участник, чьей группы у человека в
// избранном нет, по-прежнему называется по имени.
// Интеграционный: без сети (Telegram у фикстурных получателей не
// привязан), фикстуры с меткой убираются в finally. Запуск:
//
//   npx tsx tests/unit/eventPerformerNotify.test.ts

const MARK = "eventnotify-test";

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { contains: MARK } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length > 0) {
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.performerEventNotification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.favoritePerformer.deleteMany({ where: { userId: { in: userIds } } });
  }
  await prisma.user.deleteMany({ where: { email: { contains: MARK } } });

  const performers = await prisma.performer.findMany({
    where: { name: { contains: MARK } },
    select: { id: true },
  });
  const ids = performers.map((p) => p.id);
  if (ids.length > 0) {
    await prisma.bandMember.deleteMany({
      where: { OR: [{ bandId: { in: ids } }, { performerId: { in: ids } }] },
    });
    await prisma.eventPerformer.deleteMany({ where: { performerId: { in: ids } } });
  }
  await prisma.performer.deleteMany({ where: { name: { contains: MARK } } });
  const events = await prisma.event.findMany({
    where: { title: { contains: MARK } },
    select: { id: true },
  });
  if (events.length > 0) {
    const eventIds = events.map((e) => e.id);
    await prisma.eventOccurrence.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.performerEventNotification.deleteMany({ where: { eventId: { in: eventIds } } });
  }
  await prisma.event.deleteMany({ where: { title: { contains: MARK } } });
}

/** Заголовок последнего уведомления получателя — то, что человек видит. */
async function titleFor(userId: string): Promise<string> {
  const rows = await prisma.notification.findMany({ where: { userId } });
  assert.equal(rows.length, 1, "одно уведомление на пару получатель+событие");
  return rows[0].title;
}

async function main() {
  await cleanup();

  const band = await prisma.performer.create({
    data: { name: `Bandy ${MARK}`, type: "BAND" },
  });
  const members = await Promise.all(
    ["Alpha", "Beta", "Gamma"].map((n) =>
      prisma.performer.create({ data: { name: `${n} ${MARK}`, type: "SOLO" } }),
    ),
  );
  for (const m of members) {
    await prisma.bandMember.create({ data: { bandId: band.id, performerId: m.id } });
  }

  const event = await prisma.event.create({
    data: {
      title: `Tour ${MARK}`,
      venue: "Impact Arena",
      occurrences: {
        create: { startsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
      },
    },
  });

  // 1. В избранном и группа, и двое её участников.
  const withBand = await prisma.user.create({
    data: { email: `band-${MARK}@example.com`, name: `Fan A ${MARK}`, locale: "ru" },
  });
  for (const id of [band.id, members[0].id, members[1].id]) {
    await prisma.favoritePerformer.create({ data: { userId: withBand.id, performerId: id } });
  }

  // 2. В избранном только участники — группы там нет.
  const membersOnly = await prisma.user.create({
    data: { email: `solo-${MARK}@example.com`, name: `Fan B ${MARK}`, locale: "ru" },
  });
  for (const id of [members[0].id, members[1].id]) {
    await prisma.favoritePerformer.create({ data: { userId: membersOnly.id, performerId: id } });
  }

  try {
    // Состав события — как его привязывает админка: и группа, и люди.
    await notifyFavoritersAboutEventPerformers(event.id, [band.id, ...members.map((m) => m.id)]);

    const bandTitle = await titleFor(withBand.id);
    assert.ok(
      bandTitle.includes(`Bandy ${MARK}`),
      `группа названа: ${bandTitle}`,
    );
    assert.ok(
      !bandTitle.includes(`Alpha ${MARK}`) && !bandTitle.includes("и ещё"),
      `участники группы не перечисляются рядом с ней: ${bandTitle}`,
    );

    const soloTitle = await titleFor(membersOnly.id);
    assert.ok(
      soloTitle.includes(`Alpha ${MARK}`) && soloTitle.includes(`Beta ${MARK}`),
      `без группы в избранном участники названы по именам: ${soloTitle}`,
    );

    console.log("eventPerformerNotify: ok");
  } finally {
    await cleanup();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
