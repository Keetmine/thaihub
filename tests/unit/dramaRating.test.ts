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

assert.equal(combineScores(9, 8), 8.5, "среднее двух источников");
// Один источник — показываем его как есть, а не половинку.
assert.equal(combineScores(9, null), 9);
assert.equal(combineScores(null, 7.8), 7.8);
assert.equal(combineScores(null, null), null);
// Округление до десятой и тут.
assert.equal(combineScores(9, 8.3), 8.7);

console.log("ok: сведение оценок сериала");
