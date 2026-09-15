import assert from "node:assert/strict";
import { countClashes } from "../../src/lib/timeClash";

// Накладки по времени в плане поездки (docs/features/trips.md). Без базы:
//
//   npx tsx tests/unit/timeClash.test.ts

const at = (iso: string) => new Date(iso);

// Два концерта в один вечер — ровно тот случай, ради которого всё.
{
  const r = countClashes([
    { key: "a", startsAt: at("2026-10-01T19:00:00Z") },
    { key: "b", startsAt: at("2026-10-01T19:30:00Z") },
  ]);
  assert.equal(r.get("a"), 1);
  assert.equal(r.get("b"), 1);
}

// Разнесённые по вечеру — не накладка (два часа по умолчанию).
{
  const r = countClashes([
    { key: "a", startsAt: at("2026-10-01T15:00:00Z") },
    { key: "b", startsAt: at("2026-10-01T19:00:00Z") },
  ]);
  assert.equal(r.get("a"), 0);
  assert.equal(r.get("b"), 0);
}

// Разные дни не пересекаются, даже если время то же.
{
  const r = countClashes([
    { key: "a", startsAt: at("2026-10-01T19:00:00Z") },
    { key: "b", startsAt: at("2026-10-02T19:00:00Z") },
  ]);
  assert.equal(r.get("a"), 0);
}

// Известный конец уважается: стык встык — не накладка.
{
  const r = countClashes([
    { key: "a", startsAt: at("2026-10-01T18:00:00Z"), endsAt: at("2026-10-01T20:00:00Z") },
    { key: "b", startsAt: at("2026-10-01T20:00:00Z"), endsAt: at("2026-10-01T22:00:00Z") },
  ]);
  assert.equal(r.get("a"), 0);
  assert.equal(r.get("b"), 0);
}

// Длинный фестиваль накрывает короткий концерт.
{
  const r = countClashes([
    { key: "fest", startsAt: at("2026-10-01T14:00:00Z"), endsAt: at("2026-10-01T23:00:00Z") },
    { key: "gig", startsAt: at("2026-10-01T19:00:00Z") },
  ]);
  assert.equal(r.get("fest"), 1);
  assert.equal(r.get("gig"), 1);
}

// Запись без времени — «весь день», ни с чем не конфликтует и сама в
// ответе не появляется.
{
  const r = countClashes([
    { key: "allday", startsAt: at("2026-10-01T00:00:00Z"), hasTime: false },
    { key: "gig", startsAt: at("2026-10-01T19:00:00Z") },
  ]);
  assert.equal(r.has("allday"), false);
  assert.equal(r.get("gig"), 0);
}

// Трое в одно время — у каждого по двое соседей.
{
  const r = countClashes([
    { key: "a", startsAt: at("2026-10-01T19:00:00Z") },
    { key: "b", startsAt: at("2026-10-01T19:00:00Z") },
    { key: "c", startsAt: at("2026-10-01T19:00:00Z") },
  ]);
  assert.deepEqual([r.get("a"), r.get("b"), r.get("c")], [2, 2, 2]);
}

// Кривые данные (конец раньше начала) не ломают счёт.
{
  const r = countClashes([
    { key: "a", startsAt: at("2026-10-01T19:00:00Z"), endsAt: at("2026-10-01T18:00:00Z") },
    { key: "b", startsAt: at("2026-10-01T19:00:00Z") },
  ]);
  assert.equal(r.get("a"), 1);
}

console.log("timeClash: все проверки прошли");
