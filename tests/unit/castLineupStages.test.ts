import assert from "node:assert/strict";
import { groupLineupByStage } from "../../src/lib/castLineup";

/** Строка состава дня в тестах: имя нужно только для проверки порядка. */
type Row = { name: string; stage?: string | null; timeText?: string | null };

// Расписание фестиваля в «Составе этого дня»: сцены и время приходят
// строками с афиши (musicfestival.in.th), см.
// docs/features/musicfestival-import.md. Запуск:
//
//   npx tsx tests/unit/castLineupStages.test.ts

// Обычный концерт: ни сцен, ни времени — один блок, порядок как был.
const plainRows: Row[] = [{ name: "A" }, { name: "B" }, { name: "C" }];
const plain = groupLineupByStage(plainRows);
assert.equal(plain.length, 1, "без сцен — один блок");
assert.equal(plain[0].stage, null, "у единственного блока нет названия сцены");
assert.deepEqual(
  plain[0].items.map((r) => r.name),
  ["A", "B", "C"],
  "порядок не переставлен",
);

// Фестиваль: сцены идут по первому выступлению, внутри — по времени.
const festivalRows: Row[] = [
  { name: "поздний на второй", stage: "City Stage", timeText: "20:00-20:45" },
  { name: "поздний на главной", stage: "Monster Stage", timeText: "19:00-19:45" },
  { name: "ранний на второй", stage: "City Stage", timeText: "14:00-14:45" },
  { name: "ранний на главной", stage: "Monster Stage", timeText: "15:00-15:45" },
];
const festival = groupLineupByStage(festivalRows);
assert.deepEqual(
  festival.map((g) => g.stage),
  ["City Stage", "Monster Stage"],
  "City начал в 14:00 — он и первый",
);
assert.deepEqual(
  festival[0].items.map((r) => r.name),
  ["ранний на второй", "поздний на второй"],
  "внутри сцены — по времени",
);

// Ночной слот — это конец фестивального дня, а не его начало.
const nightRows: Row[] = [
  { name: "полночь", stage: "Main", timeText: "00:30-01:15" },
  { name: "вечер", stage: "Main", timeText: "22:00-22:45" },
];
const night = groupLineupByStage(nightRows);
assert.deepEqual(
  night[0].items.map((r) => r.name),
  ["вечер", "полночь"],
  "00:30 идёт после 22:00",
);

// Без времени — в конец своей сцены; без сцены — в конец дня.
const partialRows: Row[] = [
  { name: "без сцены", timeText: "15:00-15:45" },
  { name: "без времени", stage: "Main" },
  { name: "со временем", stage: "Main", timeText: "18:00-18:45" },
];
const partial = groupLineupByStage(partialRows);
assert.deepEqual(
  partial.map((g) => g.stage),
  ["Main", null],
  "безымянная группа — последняя",
);
assert.deepEqual(
  partial[0].items.map((r) => r.name),
  ["со временем", "без времени"],
  "без времени — в хвосте сцены",
);

console.log("ok: группировка состава дня по сценам и времени");
