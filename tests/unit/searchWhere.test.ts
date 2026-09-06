import assert from "node:assert/strict";
import { dramaTitleWhere, performerNameWhere } from "../../src/lib/searchWhere";

// Многословный поиск (правка владельца 2026-09-06): имя человека
// разложено по разным полям — «Babe (Tanatat Phanviriyakool)» держит
// ник в name, а настоящее имя в realName, — поэтому каждое слово
// запроса ищется отдельно, а вместе они дают пересечение. Тест на
// ФОРМУ условия: живая выдача проверена на настоящей базе. Запуск:
//
//   npx tsx tests/unit/searchWhere.test.ts

// Одно слово — как было раньше: один OR по полям, без AND.
const one = performerNameWhere("Babe");
assert.ok(Array.isArray(one.OR) && one.OR.length === 4, "одно слово — четыре поля в OR");
assert.equal(one.AND, undefined, "лишнего AND у одного слова нет");

// Несколько слов — AND из отдельных OR: каждое слово должно найтись
// хоть в одном поле.
const two = performerNameWhere("Babe Tanatat");
assert.ok(Array.isArray(two.AND) && two.AND.length === 2, "два слова — два условия");
for (const clause of two.AND as { OR?: unknown[] }[]) {
  assert.ok(Array.isArray(clause.OR) && clause.OR.length === 4, "каждое слово ищется по всем полям");
}

// Лишние пробелы не создают пустых слов.
assert.ok(
  Array.isArray(performerNameWhere("  Babe   Tanatat  ").AND) &&
    (performerNameWhere("  Babe   Tanatat  ").AND as unknown[]).length === 2,
  "пробелы схлопываются",
);

// Потолок в шесть слов — от бессмысленно длинных запросов.
const many = performerNameWhere("a b c d e f g h i");
assert.equal((many.AND as unknown[]).length, 6, "не больше шести слов");

// У сериалов то же правило и свой набор полей (включая русское название).
const drama = dramaTitleWhere("2gether the series");
assert.ok(Array.isArray(drama.AND) && drama.AND.length === 3, "три слова — три условия");
assert.ok(
  Array.isArray((drama.AND as { OR?: unknown[] }[])[0].OR) &&
    ((drama.AND as { OR?: unknown[] }[])[0].OR as unknown[]).length === 4,
  "у сериала четыре поля: title, titleRu, alsoKnownAs, nativeTitle",
);

console.log("searchWhere: ok");
