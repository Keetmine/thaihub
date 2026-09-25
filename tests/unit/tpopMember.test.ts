import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseTpopMemberPage } from "../../src/lib/tpopFandom";

// Разбор статьи участника группы на tpop.fandom.com (lib/tpopFandom.ts).
// Жалоба владельца 2026-09-26: «прогнала группу PROXIE — по участникам
// прошлось, но инфу не дозаполнило». Разбор брал только имя, даты, фото
// и агентство; рост, вес, группу крови, занятия, инструменты, сольный
// дебют и факты — нет. Фикстура — живая статья Gorn, урезанная до
// инфобокса и раздела Trivia. Без сети и без БД. Запуск:
//
//   npx tsx tests/unit/tpopMember.test.ts

const html = readFileSync(join(__dirname, "fixtures", "tpop-member-gorn.html"), "utf8");
const m = parseTpopMemberPage(html, "Gorn");

assert.equal(m.stageName, "Gorn", "ник — из поля Nickname, а не из «Other name(s): gboy (Mr.) Leo»");
assert.equal(m.birthName, "Gorn Wannapairote");
assert.equal(m.birthPlace, "Bangkok, Thailand");
assert.equal(m.height, "184 cm", "рост в сантиметрах, без футов");
assert.equal(m.weight, "62 kg");
assert.equal(m.bloodType, "B");
assert.deepEqual(m.occupation, ["Singer"]);
assert.deepEqual(m.instruments, ["Guitar"]);
assert.equal(m.soloDebut, "March 20, 2025");
assert.ok(m.trivia.length >= 5, `факты из раздела Trivia (${m.trivia.length})`);
assert.ok(m.trivia.every((f) => !/\[\d+\]/.test(f)), "сноски «[5]» вырезаны");
assert.ok(m.trivia.some((f) => /bass/i.test(f)), "содержимое фактов на месте");

console.log("tpopMember: ok");
