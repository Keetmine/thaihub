import assert from "node:assert/strict";
import { matchCatalogInText, type TagCatalog } from "../../src/lib/performerMatching";

// Артисты каталога в свободном тексте события (краулеры Ticketmelon и
// AllTicket, docs/features/ticket-site-crawl.md) — чистая функция на
// синтетическом каталоге. Без сети и БД. Запуск:
//
//   npx tsx tests/unit/textMatching.test.ts

const P = (id: string, name: string, realName: string | null = null, musicAlias: string | null = null, type: "SOLO" | "BAND" = "SOLO") => ({ id, name, realName, musicAlias, birthYear: null, type });
const catalog: TagCatalog = {
  performers: [
    P("krist", "Krist", "Perawat Sangpotirat"),
    P("singto", "Singto", "Prachaya Ruangroj"),
    P("off", "Off", "Jumpol Adulkittiporn"),
    P("gun1", "Gun", "Atthaphan Phunsawat"),
    P("gun2", "GUN", "Napat Injaieua"),
    P("first", "First", "Kanaphan Puitrakul"),
    P("nanon", "Nanon", "Korapat Kirdpan"),
    P("phuwin", "Phuwin", "Tangsakyuen Phuwin"),
    P("lykn", "LYKN", null, null, "BAND"),
    P("boss", "Boss", "Chaikamon Sermsongswad", "BOSS.CKM"),
    P("earth", "Earth", "Pirapat Watthanasetsiri"),
    P("bright", "Bright", "Vachirawit Chivaaree"),
    P("slur", "Slur", null, null, "BAND"),
    P("touch", "Touch", null),
    P("build", "Build", null),
    P("chance", "Chance", null),
  ],
  pairings: [{ performerAId: "krist", performerBId: "singto", nameA: "Krist", nameB: "Singto" }],
};
const ids = (text: string) => matchCatalogInText(text, catalog).matched.map((m) => m.performerId).sort();

// 1. Реальное имя целиком.
assert.deepEqual(ids("Special guest: Perawat Sangpotirat and friends"), ["krist"]);
// 2. Ник + первое слово реального имени — так разводятся и тёзки.
assert.deepEqual(ids("Starring Off Jumpol and Gun Atthaphan"), ["gun1", "off"], "Gun Atthaphan — первый Gun, не второй");
assert.deepEqual(ids("with GUN Napat on stage"), ["gun2"]);
// 3. Склейка ников пейринга — оба.
assert.deepEqual(ids("KristSingto Fan Meeting in Taipei"), ["krist", "singto"]);
assert.deepEqual(ids("SINGTOKRIST day"), ["krist", "singto"], "порядок и регистр не важны");
assert.deepEqual(ids("White Christmas: Krist Singto Berlin Fan Meeting"), ["krist", "singto"], "пейринг через пробел");
// 4. Группа целиком, регистр не важен, от четырёх знаков («Slur» — настоящая группа).
assert.deepEqual(ids("Joining the lineup: Lykn, Reality Club, SLUR"), ["lykn", "slur"]);
assert.deepEqual(ids("the lineup is huge"), [], "трёхбуквенных групп в тексте не ищем");
assert.deepEqual(ids("Live: BOSS.CKM"), ["boss"], "музыкальный алиас");
// 5. Одиночный ник: от пяти знаков, не стоп-слово, единственный в каталоге.
assert.deepEqual(ids("Nanon will perform"), ["nanon"]);
assert.deepEqual(ids("Phuwin's birthday party"), ["phuwin"], "апостроф — граница слова");
assert.deepEqual(ids("Turn off the lights, first come first served, earth day"), [], "«Off», «First», «Earth» поодиночке — обычные слова");
assert.deepEqual(ids("Bright lights big city"), [], "«Bright» — стоп-слово");
assert.deepEqual(ids("Touch the sky, build a chance"), [], "«Touch», «Build», «Chance» — стоп-слова из сухого прогона");
assert.deepEqual(ids("Gun show tonight"), [], "тёзки по одному нику не ищутся");
assert.deepEqual(ids("Krist is coming"), ["krist"], "пять знаков и единственный в каталоге — ищется");
assert.deepEqual(ids("Boss is coming"), [], "четыре знака — мало (алиас BOSS.CKM в тексте не встретился)");
// Границы слов: «Nanonx» — не Nanon; тайская буква рядом — граница.
assert.deepEqual(ids("Nanonx"), []);
assert.deepEqual(ids("พบกับNanonที่งาน"), ["nanon"]);
// Один человек несколькими правилами — одна привязка.
assert.deepEqual(ids("Krist Perawat (KristSingto)"), ["krist", "singto"]);

console.log("textMatching: ok");
