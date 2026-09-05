import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMdlDramaCast } from "../../src/lib/mydramalist";

// Каст ШОУ со страницы MDL (Type: TV Program) — там участники размечены
// не ролями («Main Role»), а участием («Regular Member», «Main Host»,
// «Guest»); до 2026-09 парсер такие подписи не знал, и у шоу каст не
// распознавался вовсе (жалоба владельца на /774297-high-season-rainy:
// «12 ссылок на людей, но карточек актёров не распознали»). Фикстура —
// блок каста с той самой живой страницы. Без сети и без БД. Запуск:
//
//   npx tsx tests/unit/mdlShowCast.test.ts

const html = readFileSync(join(__dirname, "fixtures", "mdl-show-cast.html"), "utf8");

const cast = parseMdlDramaCast(html);

assert.equal(cast.length, 6, "шесть участников шоу");
assert.ok(
  cast.every((c) => c.roleType === "Regular Member"),
  "все — Regular Member",
);
assert.ok(
  cast.some((c) => c.name === "Sing Harit Cheewagaroon"),
  "имена читаются из ссылок",
);
// Между именем и подписью роли у шоу стоят номера выпусков («(Ep. 1-2)»)
// — это не имя персонажа, в поле роли такое попадать не должно.
assert.ok(
  cast.every((c) => c.role === null),
  "номера выпусков не принимаются за персонажа",
);

console.log("mdlShowCast: ok");
