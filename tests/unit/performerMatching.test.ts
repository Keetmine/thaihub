import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma";
import { matchArtistsByNickname } from "../../src/lib/performerMatching";

// Матчинг состава события с каталогом (вынесен из «события по ссылке» в
// src/lib/performerMatching.ts — им же пользуется краулер афиши).
// Интеграционный, как mdlDramaRequests.test.ts: без сети, фикстурный
// исполнитель с меткой убирается в finally. Запуск:
//
//   npx tsx tests/unit/performerMatching.test.ts

const MARK = "ttmmatch-test";
const NICKNAME = `Zzyx-${MARK}`;

async function cleanup() {
  await prisma.performer.deleteMany({ where: { name: { contains: MARK } } });
}

async function main() {
  await cleanup();
  const performer = await prisma.performer.create({
    data: { name: NICKNAME, realName: `Full Name ${MARK}` },
  });

  try {
    const matched = await matchArtistsByNickname([
      // Точное совпадение ника.
      { fullName: "Full Name", nickname: NICKNAME },
      // Регистр и края не мешают: правило — case-insensitive + trim.
      { fullName: "Full Name", nickname: ` ${NICKNAME.toUpperCase()} ` },
      // Незнакомый ник — совпадения нет, но артист не теряется.
      { fullName: "Somebody Else", nickname: `Nobody-${MARK}` },
      // Матчим по нику, НЕ по полному имени: realName совпадает, ник нет.
      { fullName: `Full Name ${MARK}`, nickname: `Other-${MARK}` },
    ]);

    assert.equal(matched.length, 4, "каждому артисту — своя строка результата");
    assert.equal(matched[0].matchedPerformerId, performer.id);
    assert.equal(matched[1].matchedPerformerId, performer.id, "регистр/пробелы не мешают");
    assert.equal(matched[2].matchedPerformerId, null);
    assert.equal(matched[3].matchedPerformerId, null, "полное имя — не ключ матчинга");

    // Поля артиста проезжают насквозь без изменений — экран проверки
    // «события по ссылке» показывает их как спарсили.
    assert.equal(matched[2].fullName, "Somebody Else");
    assert.equal(matched[2].nickname, `Nobody-${MARK}`);

    console.log("ok: performerMatching");
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
