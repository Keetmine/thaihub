import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma";
import { matchMascotOwners } from "../../src/lib/performerMatching";

// Матчинг владельцев маскота с каталогом (matchMascotOwners в
// src/lib/performerMatching.ts — им пользуется краулер вики GMMTV,
// src/lib/gmmtvMascots.ts). Интеграционный, как performerMatching.test.ts:
// без сети, фикстурные исполнители с меткой убираются в finally. Запуск:
//
//   npx tsx tests/unit/mascotOwnerMatching.test.ts

const MARK = "mascotmatch-test";

async function cleanup() {
  await prisma.performer.deleteMany({ where: { name: { contains: MARK } } });
}

async function main() {
  await cleanup();

  // Тёзки-сольники (в каталоге ников «New»/«Earth» по несколько) —
  // разводятся настоящим именем из заголовка вики-страницы.
  const twinA = await prisma.performer.create({
    data: { name: `Zed-${MARK}`, realName: `Thitipoom ${MARK}`, type: "SOLO" },
  });
  await prisma.performer.create({
    data: { name: `Zed-${MARK}`, realName: `Chayapak ${MARK}`, type: "SOLO" },
  });
  // Группа — BAND по name; регистр не мешает.
  const band = await prisma.performer.create({
    data: { name: `LYKN-${MARK}`, type: "BAND" },
  });
  // Сольник, находимый по musicAlias.
  const alias = await prisma.performer.create({
    data: { name: `Someone-${MARK}`, musicAlias: `Aliaz-${MARK}`, type: "SOLO" },
  });
  // Маскот-тёзка: владельцем быть не может (не SOLO/BAND).
  await prisma.performer.create({ data: { name: `Masc-${MARK}`, type: "MASCOT" } });

  try {
    // Тёзки + заголовок вики-страницы «Ник НастоящееИмя» → один точный.
    const twins = await matchMascotOwners([
      { name: `Zed-${MARK}`, wikiTitle: `Zed-${MARK} Thitipoom ${MARK}`, kindHint: "pair" },
    ]);
    assert.deepEqual(
      twins.matched.map((m) => m.performerId),
      [twinA.id],
      "тёзки развелись настоящим именем",
    );
    assert.deepEqual(twins.unmatched, []);

    // Тёзки БЕЗ подсказки — честный пропуск: ложная привязка хуже.
    const ambiguous = await matchMascotOwners([{ name: `Zed-${MARK}`, kindHint: "pair" }]);
    assert.deepEqual(ambiguous.matched, [], "неразведённые тёзки не матчатся");
    assert.deepEqual(ambiguous.unmatched, [`Zed-${MARK}`]);

    // Группа: BAND по name, case-insensitive; подсказка «group» не даёт
    // совпасть с сольником-тёзкой.
    const groups = await matchMascotOwners([
      { name: `lykn-${MARK}`.toUpperCase(), kindHint: "group" },
    ]);
    assert.deepEqual(groups.matched, [
      { performerId: band.id, name: band.name, type: "BAND" },
    ]);

    // musicAlias у сольника тоже считается.
    const byAlias = await matchMascotOwners([{ name: `Aliaz-${MARK}`, kindHint: "solo" }]);
    assert.deepEqual(byAlias.matched.map((m) => m.performerId), [alias.id]);

    // Маскот и просто неизвестное имя — в несовпавшие.
    const misses = await matchMascotOwners([
      { name: `Masc-${MARK}`, kindHint: "solo" },
      { name: `Nobody-${MARK}` },
    ]);
    assert.deepEqual(misses.matched, []);
    assert.deepEqual(misses.unmatched, [`Masc-${MARK}`, `Nobody-${MARK}`]);

    console.log("mascotOwnerMatching.test.ts: ok");
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
