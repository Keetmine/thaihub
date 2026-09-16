import assert from "node:assert/strict";
import {
  DEFAULT_ANSWERS,
  parseAnswers,
  pickSteps,
  shuffleTake,
} from "../../src/lib/dramaPicker";

// Подбор сериала квизом (src/lib/dramaPicker.ts). Чистые функции:
//
//   npx tsx tests/unit/dramaPicker.test.ts

// --- parseAnswers: мусор из формы это «неважно», а не ошибка ---
assert.deepEqual(parseAnswers({}), DEFAULT_ANSWERS);
assert.deepEqual(parseAnswers({ mood: "нет такого", genre: "../x" }), DEFAULT_ANSWERS);
assert.deepEqual(parseAnswers({ mood: "cry", genre: "Music", seen: "fresh", air: "ongoing" }), {
  mood: "cry",
  genre: "Music",
  seen: "fresh",
  air: "ongoing",
});

// --- pickSteps: порядок снятия условий ---
// Пусто на все «неважно» — подбор тогда идёт по всему каталогу.
assert.deepEqual(pickSteps(DEFAULT_ANSWERS), []);

const all = pickSteps({ mood: "tense", genre: "Action", seen: "fresh", air: "finished" });
assert.deepEqual(
  all.map((s) => s.key),
  ["genre", "mood", "air"],
  "уточняющий жанр снимается первым, статус выхода последним",
);
assert.deepEqual(all[0].genres, ["Action"]);
assert.deepEqual(all[1].genres, ["Thriller", "Mystery", "Crime", "Psychological"]);
assert.equal(all[2].status, "ENDED");
assert.equal(pickSteps({ ...DEFAULT_ANSWERS, air: "ongoing" })[0].status, "RETURNING_SERIES");

// Ответ про «новое/пересмотреть» в ступени НЕ попадает: он про личный
// список и сниматься не должен.
assert.ok(!all.some((s) => (s.key as string) === "seen"));

// «Неважно» в настроении не добавляет ступень.
assert.deepEqual(pickSteps({ ...DEFAULT_ANSWERS, mood: "any" }), []);

// --- shuffleTake ---
const src = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const taken = shuffleTake(src, 4);
assert.equal(taken.length, 4);
assert.equal(new Set(taken).size, 4, "без повторов");
assert.ok(taken.every((n) => src.includes(n)));
assert.deepEqual(src, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "исходный массив не тронут");
assert.equal(shuffleTake([1, 2], 10).length, 2, "просят больше, чем есть");
assert.deepEqual(shuffleTake([], 3), []);

// Перестановка равномерная: с random = 0 Fisher–Yates разворачивает
// набор предсказуемо — проверяем, что элементы не теряются и не двоятся.
const deterministic = shuffleTake(src, 10, () => 0);
assert.deepEqual([...deterministic].sort((a, b) => a - b), src);

console.log("dramaPicker.test.ts: ok");
