import assert from "node:assert/strict";
import { tripDayStats, tripDays, unionTripDays } from "../../src/lib/tripDays";

// Счётчики по поездкам (src/lib/tripDays.ts) для статистики профиля и
// ачивок: длина поездки, объединение перекрывающихся диапазонов (своя +
// совместная на те же даты не удваивают «дни в Таиланде») и правило
// «дни — только по завершённым, поездки — по всем». Чистая функция — без
// БД. Запуск:
//
//   npx tsx tests/unit/tripDays.test.ts

const d = (iso: string) => new Date(iso);
const trip = (from: string, to: string) => ({ startDate: d(from), endDate: d(to) });
const now = d("2026-09-05T12:00:00Z");

// --- длина одной поездки, обе границы включительно ---

assert.equal(tripDays(trip("2026-04-04T00:00:00Z", "2026-04-19T00:00:00Z")), 16, "4–19 апреля — 16 дней");
assert.equal(tripDays(trip("2026-04-04T00:00:00Z", "2026-04-04T00:00:00Z")), 1, "однодневная");
// Старые записи лежат 21:00 UTC предыдущего дня (создавались в локальной
// зоне) — длина та же, что у полуночных.
assert.equal(tripDays(trip("2025-10-19T21:00:00Z", "2025-11-10T21:00:00Z")), 23, "смещённые на 21:00 даты");

// --- объединение диапазонов ---

assert.equal(unionTripDays([]), 0, "нет поездок");
assert.equal(
  unionTripDays([trip("2026-04-04T00:00:00Z", "2026-04-19T00:00:00Z"), trip("2026-04-04T00:00:00Z", "2026-04-19T00:00:00Z")]),
  16,
  "своя и совместная на те же даты — один раз",
);
assert.equal(
  unionTripDays([trip("2026-04-01T00:00:00Z", "2026-04-10T00:00:00Z"), trip("2026-04-08T00:00:00Z", "2026-04-15T00:00:00Z")]),
  15,
  "частичное перекрытие: 1–15 апреля",
);
assert.equal(
  unionTripDays([trip("2026-04-01T00:00:00Z", "2026-04-05T00:00:00Z"), trip("2026-04-06T00:00:00Z", "2026-04-08T00:00:00Z")]),
  8,
  "стык день-в-день без пересечения — сумма",
);
assert.equal(
  unionTripDays([trip("2026-05-01T00:00:00Z", "2026-05-03T00:00:00Z"), trip("2026-04-01T00:00:00Z", "2026-04-02T00:00:00Z")]),
  5,
  "несортированный ввод, разрозненные поездки",
);
assert.equal(
  unionTripDays([trip("2026-04-01T00:00:00Z", "2026-04-30T00:00:00Z"), trip("2026-04-10T00:00:00Z", "2026-04-12T00:00:00Z")]),
  30,
  "вложенная поездка не добавляет дней",
);
assert.equal(
  unionTripDays([trip("2025-10-19T21:00:00Z", "2025-11-10T21:00:00Z"), trip("2025-10-20T00:00:00Z", "2025-11-11T00:00:00Z")]),
  23,
  "та же поездка в старом (21:00) и новом (00:00) формате дат — один раз",
);

// --- свод: дни только по завершённым, поездки и самая длинная — по всем ---

const past = trip("2025-10-20T00:00:00Z", "2025-11-11T00:00:00Z"); // 23 дня, завершена
const songkran = trip("2026-04-04T00:00:00Z", "2026-04-19T00:00:00Z"); // 16 дней, завершена
const future = trip("2026-10-17T00:00:00Z", "2026-10-31T00:00:00Z"); // 15 дней, впереди
const current = trip("2026-09-01T00:00:00Z", "2026-09-10T00:00:00Z"); // идёт сейчас

assert.deepEqual(tripDayStats([], now), { trips: 0, longestTripDays: 0, daysInThailand: 0 }, "пусто");
assert.deepEqual(
  tripDayStats([past, songkran, future], now),
  { trips: 3, longestTripDays: 23, daysInThailand: 39 },
  "владелец: будущая поездка в счётчике поездок, но не в днях",
);
assert.deepEqual(
  tripDayStats([current], now),
  { trips: 1, longestTripDays: 10, daysInThailand: 0 },
  "текущая поездка засчитается в дни только после возвращения",
);
assert.deepEqual(
  tripDayStats([songkran, songkran], now),
  { trips: 2, longestTripDays: 16, daysInThailand: 16 },
  "участница с собственной поездкой на даты совместной: две поездки, дни один раз",
);

console.log("tripDays: ok");
