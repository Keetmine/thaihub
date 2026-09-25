import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma";
import { buildFactRows, enqueueFacts } from "../../src/lib/factsReview";

// Очередь фактов на проверку (lib/factsReview.ts, раздел /admin/facts).
// Таблица разбора — чистая; постановка в очередь — интеграционно, фикстурный
// артист с меткой убирается в finally. Запуск:
//
//   npx tsx tests/unit/factsReview.test.ts

// ---------- таблица разбора «до / после / перевод» ----------
assert.deepEqual(
  buildFactRows(["Likes cats", "Born in Bangkok"], ["Любит кошек", "Родился в Бангкоке"], ["likes cats.", "Plays bass"]),
  [
    { original: "Likes cats", en: "Likes cats", ru: "Любит кошек" },
    { original: "Born in Bangkok", en: "Born in Bangkok", ru: "Родился в Бангкоке" },
    { original: null, en: "Plays bass", ru: "" },
  ],
  "наши сверху со своим переводом; пришедшее, которое у нас уже есть, не дублируется; новое — без перевода",
);
assert.deepEqual(
  buildFactRows(["A fact"], [], ["New one"]),
  [{ original: "A fact", en: "A fact", ru: "" }, { original: null, en: "New one", ru: "" }],
  "русского у нас не было — перевод пустой и у наших",
);

// ---------- постановка в очередь ----------
const MARK = "factsq-test";
async function main() {
  await prisma.performer.deleteMany({ where: { name: { contains: MARK } } });
  const p = await prisma.performer.create({ data: { name: `Artist ${MARK}`, trivia: ["He likes cats"] } });
  try {
    assert.equal(await enqueueFacts(p.id, "tpop-fandom", ["he likes cats."]), "nothing", "то, что у нас уже есть, не ставится");
    assert.equal(await enqueueFacts(p.id, "tpop-fandom", ["He plays bass", "x"]), "queued");
    assert.equal(await enqueueFacts(p.id, "tpop-fandom", ["He plays bass", "Born in Nan"]), "merged", "повторный импорт дописывает в ту же запись");
    const rows = await prisma.factsReview.findMany({ where: { performerId: p.id } });
    assert.equal(rows.length, 1, "одна запись на артиста и источник");
    assert.deepEqual(rows[0].incoming, ["He plays bass", "Born in Nan"], "без повторов и без мусора короче 5 знаков");
    assert.equal(rows[0].status, "PENDING");
    console.log("factsReview: ok");
  } finally {
    await prisma.performer.deleteMany({ where: { name: { contains: MARK } } });
  }
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
