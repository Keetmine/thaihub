import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseGmmtvMascots, normalizeMascotName } from "../../src/lib/gmmtvMascots";

// Парсер страницы Mascots gmmtv.fandom.com — на сохранённом фрагменте
// живой разметки (2026-09, ревизия 14826, вывод action=parse). Без сети
// и без БД. Запуск:
//
//   npx tsx tests/unit/gmmtvMascots.test.ts
//
// Фрагмент нарочно содержит все встреченные вживую формы секций:
// обычная пара со ссылками и строкой «Live debut» (Polcasan), группа
// одной ссылкой (Lykyou), одиночный актёр (Smyle), секция со
// слайдшоу вместо <figure> и владельцем-группой БЕЗ ссылки (Flarey,
// «boy group JASP.ER»), плюс секция References, которая маскотом не
// является.

const html = readFileSync(join(__dirname, "fixtures", "gmmtv-mascots.html"), "utf8");
const mascots = parseGmmtvMascots(html);

// --- normalizeMascotName ---

assert.equal(normalizeMascotName("  Sol   Cute "), "sol cute", "пробелы схлопываются, casefold");
assert.equal(normalizeMascotName("POLCASAN"), "polcasan");
assert.equal(normalizeMascotName("Ｐｏｌｃａｓａｎ"), "polcasan", "NFKC: полноширинные буквы");

// --- секции ---

assert.deepEqual(
  mascots.map((m) => m.name),
  ["Polcasan", "Lykyou", "Smyle", "Flarey"],
  "по маскоту на секцию; References маскотом не считается",
);

// --- Polcasan: пара со ссылками ---

const polcasan = mascots[0];
assert.equal(polcasan.anchor, "Polcasan");
assert.equal(polcasan.sourceUrl, "https://gmmtv.fandom.com/wiki/Mascots#Polcasan");
assert.equal(polcasan.ownerKind, "pair");
assert.deepEqual(
  polcasan.owners,
  [
    { name: "Tay", wikiTitle: "Tay Tawan Vihokratana" },
    { name: "New", wikiTitle: "New Thitipoom Techa-apaikhun" },
  ],
  "пара «Tay-New» — два владельца, у каждого заголовок его вики-страницы",
);
// Картинка — полноразмерная и с именем файла последним сегментом пути:
// хвост /revision/latest[/scale-to-width-down/150] отрезан целиком —
// иначе downloadRemoteImage при одобрении назвал бы КАЖДУЮ картинку
// «latest» и склеил бы разных маскотов в один локальный файл.
assert.ok(polcasan.imageUrl, "у Polcasan есть картинка");
assert.match(polcasan.imageUrl!, /^https:\/\/static\.wikia\.nocookie\.net\/gmmtv\/images\//);
assert.match(polcasan.imageUrl!, /\/Polcasan_profile_image\.jpg\?cb=\d+$/, "имя файла в конце, cb сохранён");
assert.ok(!polcasan.imageUrl!.includes("/revision/"), "хвост /revision/… отрезан");
assert.ok(!polcasan.imageUrl!.includes("scale-to-width-down"), "без уменьшающего хвоста");
// Описание — без цифр-сносок.
assert.match(polcasan.description, /^Polcasan is the mascot of the boys love pair Tay-New/);
assert.ok(!/\[\d+\]/.test(polcasan.description), "сноски [13] вычищены");

// --- Lykyou: группа одной ссылкой ---

const lykyou = mascots[1];
assert.equal(lykyou.ownerKind, "group");
assert.deepEqual(lykyou.owners, [{ name: "LYKN", wikiTitle: "LYKN" }]);

// --- Smyle: одиночный актёр ---

const smyle = mascots[2];
assert.equal(smyle.ownerKind, "solo");
assert.deepEqual(smyle.owners, [{ name: "Sky", wikiTitle: "Sky Wongravee Nateetorn" }]);

// --- Flarey: слайдшоу вместо <figure>, владелец-группа без ссылки ---

const flarey = mascots[3];
assert.equal(flarey.ownerKind, "group");
assert.deepEqual(
  flarey.owners,
  [{ name: "JASP.ER", wikiTitle: null }],
  "без ссылки берётся голый текст; точка в имени группы не режет его надвое",
);
assert.ok(flarey.imageUrl, "картинка достаётся и из слайдшоу");
assert.match(flarey.imageUrl!, /static\.wikia\.nocookie\.net\/gmmtv\/images/);
assert.ok(
  !/Instagram|X_Logo|TikTok/.test(flarey.imageUrl ?? ""),
  "логотипы соцсетей из ячейки Accounts картинкой не считаются",
);

console.log("gmmtvMascots.test.ts: ok");
