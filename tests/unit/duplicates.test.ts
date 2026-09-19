import assert from "node:assert/strict";
import { nicknamePrefixGroups, fullNameInclusionPairs } from "../../src/lib/duplicates";

// Сетка «ник приклеен к имени» на странице дублей
// (docs/features/duplicates.md). Без базы:
//
//   npx tsx tests/unit/duplicates.test.ts

const p = (id: string, name: string) => ({ id, name });
const keysOf = (rows: { id: string; name: string }[]) =>
  nicknamePrefixGroups(rows)
    .map((g) => g.rows.map((r) => r.id).sort().join("+"))
    .sort();

// 1. Ради чего сетка и заводилась: одна запись — паспортное имя, вторая
//    то же имя с ником спереди.
assert.deepEqual(
  keysOf([
    p("a", "Nuntapong Wongsakulyong"),
    p("b", "Copter Nuntapong Wongsakulyong"),
    p("c", "Somchai Prasert"),
  ]),
  [["a", "b"].join("+")],
  "ник спереди — дубль",
);

// 2. Два ника у одного человека: базовой записи нет вовсе, а хвост общий.
assert.deepEqual(
  keysOf([p("a", "Kat Focus Jirakul"), p("b", "Fluke Focus Jirakul")]),
  [["a", "b"].join("+")],
  "общий хвост из двух слов — дубль даже без базовой записи",
);

// 3. Корейские имена: дефис внутри личного имени НЕ режем, иначе «Kim
//    Seok» ложно входит в «Kim Dong-seok» — это разные люди.
assert.deepEqual(keysOf([p("a", "Kim Seok"), p("b", "Kim Dong-seok")]), [], "дефис не режем");
assert.deepEqual(keysOf([p("a", "Joo Ho"), p("b", "Yang Joo-ho")]), [], "и здесь тоже");

// 4. Хвост в одно слово — не сигнал: «Ohm» носит половина каталога.
assert.deepEqual(keysOf([p("a", "OHM"), p("b", "Ohm Atshar Nampan")]), [], "одного слова мало");

// 5. Порядок слов важен: у «Kim Young-ho» и «Kim Ho-young» одинаковый
//    НАБОР слов, но это разные люди.
assert.deepEqual(keysOf([p("a", "Kim Young Ho"), p("b", "Kim Ho Young")]), [], "порядок слов важен");

// 6. Регистр и апострофы не мешают, лишние пробелы тоже.
assert.deepEqual(
  keysOf([p("a", "O'Brien  Smith"), p("b", "Danny OBrien Smith")]),
  [["a", "b"].join("+")],
  "апострофы и двойные пробелы — шум",
);

// 7. Три варианта одного человека собираются в ОДНУ группу, а не в пары.
assert.deepEqual(
  keysOf([
    p("a", "Somchai Prasert"),
    p("b", "Bank Somchai Prasert"),
    p("c", "Benz Somchai Prasert"),
  ]),
  [["a", "b", "c"].join("+")],
  "три варианта — одна группа",
);

console.log("duplicates: ok");

// ---------- fullNameInclusionPairs: что можно слить не глядя ----------

// Разовый прогон слияния (scripts/merge-nickname-duplicates.ts) берёт
// только ПОЛНОЕ вхождение имени: из такой пары видно и полное имя, и ник.
const pairsOf = (rows: { id: string; name: string }[]) =>
  fullNameInclusionPairs(rows).pairs.map((p) => `${p.long.id}>${p.short.id}:${p.nickname}`).sort();
const ambiguousOf = (rows: { id: string; name: string }[]) =>
  fullNameInclusionPairs(rows).ambiguous.map((g) => g.rows.map((r) => r.id).sort().join("+")).sort();

assert.deepEqual(
  pairsOf([
    p("a", "Smile Parada Thitawachira"),
    p("b", "Parada Thitawachira"),
    p("c", "Somchai Prasert"),
  ]),
  ["a>b:Smile"],
  "ник спереди + полное имя — пара, ник вырезан из исходной строки",
);

// Общий хвост без базовой записи страница дублей показывает, а прогон
// слияния не трогает: какое из имён полное — неизвестно.
assert.deepEqual(
  pairsOf([p("a", "Kat Focus Jirakul"), p("b", "Fluke Focus Jirakul")]),
  [],
  "два ника без базовой записи — не наш случай",
);

// Три записи на одно имя владелец разбирает сама.
assert.deepEqual(
  pairsOf([
    p("a", "Smile Parada Thitawachira"),
    p("b", "Parada Thitawachira"),
    p("c", "Mild Parada Thitawachira"),
  ]),
  [],
  "три дубля — не сливаем",
);
assert.deepEqual(
  ambiguousOf([
    p("a", "Smile Parada Thitawachira"),
    p("b", "Parada Thitawachira"),
    p("c", "Mild Parada Thitawachira"),
  ]),
  [["a", "b", "c"].join("+")],
  "три дубля — одной группой в «разобрать руками»",
);

// Ник из двух слов — тоже пара; регистр и дефисы берутся из исходного имени.
assert.deepEqual(
  pairsOf([p("a", "Nan-Nan Chanya Wongsakul"), p("b", "Chanya Wongsakul")]),
  ["a>b:Nan-Nan"],
  "ник с дефисом сохраняется как есть",
);

// Одно слово хвоста — мало: «Ohm» носит половина каталога.
assert.deepEqual(
  pairsOf([p("a", "Ohm Atshar Nampan"), p("b", "Nampan")]),
  [],
  "хвост из одного слова не считается",
);

// Две записи с буквально одинаковым именем — другая сетка.
assert.deepEqual(
  pairsOf([
    p("a", "Smile Parada Thitawachira"),
    p("b", "Parada Thitawachira"),
    p("c", "Parada Thitawachira"),
  ]),
  [],
  "точные тёзки — не этот прогон",
);

console.log("duplicates: все проверки прошли");
