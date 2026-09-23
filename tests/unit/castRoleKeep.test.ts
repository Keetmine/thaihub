import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma";
import { linkTmdbCast } from "../../src/lib/tmdbImport";

// Имя персонажа в связке «актёр — сериал» не должно пропадать от того,
// что кто-то обновил карточку актёра (жалоба владельца 2026-09-23:
// «захожу на сериал, а кого играл — исчезло»). У TMDB поле character у
// тайских тайтлов сплошь пустое, а у нас там обычно имя с MyDramaList,
// поэтому импорт роль дописывает, но не перезаписывает.
// Интеграционный, без сети: linkTmdbCast принимает каст готовым.
// Запуск:
//
//   npx tsx tests/unit/castRoleKeep.test.ts

const MARK = "roleKeep-test";

async function cleanup() {
  const ids = (
    await prisma.performer.findMany({
      where: { name: { contains: MARK } },
      select: { id: true },
    })
  ).map((p) => p.id);
  if (ids.length > 0) {
    await prisma.performerDrama.deleteMany({ where: { performerId: { in: ids } } });
  }
  await prisma.performer.deleteMany({ where: { name: { contains: MARK } } });
  await prisma.drama.deleteMany({ where: { title: { contains: MARK } } });
}

async function main() {
  await cleanup();
  const drama = await prisma.drama.create({ data: { title: `Drama ${MARK}` } });
  // Актёр с ролью, проставленной раньше (в жизни — импортом с MDL).
  const withRole = await prisma.performer.create({
    data: { name: `Known ${MARK}`, tmdbId: `90000001-${MARK}` },
  });
  await prisma.performerDrama.create({
    data: { performerId: withRole.id, dramaId: drama.id, role: "Tian" },
  });
  // И тот же актёр, но роли у связи нет — её как раз можно дописать.
  const noRole = await prisma.performer.create({
    data: { name: `Blank ${MARK}`, tmdbId: `90000002-${MARK}` },
  });
  await prisma.performerDrama.create({
    data: { performerId: noRole.id, dramaId: drama.id, role: null },
  });

  try {
    await linkTmdbCast(drama.id, [
      // TMDB персонажа не знает — наш «Tian» должен уцелеть.
      { personId: 90000001, name: `Known ${MARK}`, photoUrl: null, character: null },
      // А пустую роль дописать можно.
      { personId: 90000002, name: `Blank ${MARK}`, photoUrl: null, character: "Phupha" },
    ]);

    const kept = await prisma.performerDrama.findUniqueOrThrow({
      where: { performerId_dramaId: { performerId: withRole.id, dramaId: drama.id } },
    });
    assert.equal(kept.role, "Tian", "пустая роль с TMDB не затирает нашу");

    const added = await prisma.performerDrama.findUniqueOrThrow({
      where: { performerId_dramaId: { performerId: noRole.id, dramaId: drama.id } },
    });
    assert.equal(added.role, "Phupha", "а пустую роль TMDB дописывает");

    // Роль не должна меняться и на второй, «конкурирующий» заход: у TMDB
    // может стоять своё имя персонажа, но наше — с MDL, и оно точнее.
    await linkTmdbCast(drama.id, [
      { personId: 90000001, name: `Known ${MARK}`, photoUrl: null, character: "Tian Sopon" },
    ]);
    const stillKept = await prisma.performerDrama.findUniqueOrThrow({
      where: { performerId_dramaId: { performerId: withRole.id, dramaId: drama.id } },
    });
    assert.equal(stillKept.role, "Tian", "заполненную роль TMDB не переписывает");

    console.log("castRoleKeep: ok");
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
