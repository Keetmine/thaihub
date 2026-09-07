import assert from "node:assert/strict";
import { combineScores, mergeVotes } from "../../src/lib/dramaRating";

// Сведение оценок сериала: свои звёздочки + отзывы → оценка сайта, она
// же в среднем с MyDramaList (docs/features/catalog.md). Без базы:
//
//   npx tsx tests/unit/dramaRating.test.ts

// ---------- один человек — один голос ----------

// У человека и звёздочка, и отзыв — это одно мнение, а не два голоса.
// Побеждает звёздочка: её ставят позже и меняют чаще.
{
  const scores = mergeVotes(
    [{ dramaId: "d1", userId: "u1", rating: 9 }],
    [{ dramaId: "d1", userId: "u1", rating: 6 }],
  );
  assert.deepEqual(scores.get("d1"), { site: 9, siteCount: 1 });
}

// Разные люди — оба голоса считаются.
{
  const scores = mergeVotes(
    [{ dramaId: "d1", userId: "u1", rating: 9 }],
    [{ dramaId: "d1", userId: "u2", rating: 6 }],
  );
  assert.deepEqual(scores.get("d1"), { site: 7.5, siteCount: 2 });
}

// Отзыв без звёздочки считается сам по себе.
{
  const scores = mergeVotes([], [{ dramaId: "d1", userId: "u1", rating: 8 }]);
  assert.deepEqual(scores.get("d1"), { site: 8, siteCount: 1 });
}

// Половинки не теряются, среднее округляем до десятой — «8.166…» в
// подписи выглядело бы поломкой.
{
  const scores = mergeVotes(
    [
      { dramaId: "d1", userId: "u1", rating: 8.5 },
      { dramaId: "d1", userId: "u2", rating: 7.5 },
      { dramaId: "d1", userId: "u3", rating: 8.5 },
    ],
    [],
  );
  assert.deepEqual(scores.get("d1"), { site: 8.2, siteCount: 3 });
}

// Сериалы не путаются между собой.
{
  const scores = mergeVotes(
    [
      { dramaId: "d1", userId: "u1", rating: 10 },
      { dramaId: "d2", userId: "u1", rating: 2 },
    ],
    [],
  );
  assert.equal(scores.get("d1")?.site, 10);
  assert.equal(scores.get("d2")?.site, 2);
}

// Никто не оценил — записи в карте нет вовсе (а не «0»).
assert.equal(mergeVotes([], []).get("d1"), undefined);

// ---------- сводное число ----------

// Ради чего вводился вес (жалоба владельца): у MyDramaList 7.5 на
// тысяче отзывов, у нас ОДНА десятка — итог обязан остаться около 7.5,
// а не улететь на 8.5, как было при ровном среднем.
assert.equal(combineScores(10, 1, 7.5), 7.6);

// Двадцать наших голосов весят наравне с MDL — ровно середина.
assert.equal(combineScores(10, 20, 8), 9);

// Сотня наших перевешивает: итог тянется к нашей оценке.
assert.equal(combineScores(10, 100, 5), 9.2);

// Один источник — показываем его как есть, без всякого веса.
assert.equal(combineScores(9, 3, null), 9);
assert.equal(combineScores(null, 0, 7.8), 7.8);
assert.equal(combineScores(null, 0, null), null);
// Оценка без голосов — не оценка: считаем, что у нас её нет.
assert.equal(combineScores(9, 0, 7.5), 7.5);

console.log("ok: сведение оценок сериала");
