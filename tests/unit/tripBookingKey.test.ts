import assert from "node:assert/strict";
import { sameFlightKey } from "../../src/lib/tripBookingKey";

// Ключ «тот же рейс» для присоединения к чужому перелёту вместо дубля
// (docs/features/trips.md, «Кто летит»). Без сети и БД:
//
//   npx tsx tests/unit/tripBookingKey.test.ts

const d = new Date("2026-04-04T07:40:00Z");

assert.equal(sameFlightKey("FLIGHT", "B2 975", d), "B2975@2026-04-04");
assert.equal(sameFlightKey("FLIGHT", "b2-975", d), "B2975@2026-04-04", "регистр, пробелы и дефисы не в счёт");
assert.equal(sameFlightKey("FLIGHT", " B2  975 ", d), "B2975@2026-04-04");
assert.notEqual(sameFlightKey("FLIGHT", "B2 975", d), sameFlightKey("FLIGHT", "B2 975", new Date("2026-04-05T07:40:00Z")), "другой день — другой рейс");
assert.notEqual(sameFlightKey("FLIGHT", "B2 975", d), sameFlightKey("FLIGHT", "B2 976", d));
assert.equal(sameFlightKey("FLIGHT", "B2 975", null), null, "без даты вылета ключа нет");
assert.equal(sameFlightKey("HOTEL", "Sukhumvit 11", d), null, "отели не склеиваются");
assert.equal(sameFlightKey("FLIGHT", "   ", d), null);

console.log("tripBookingKey: ok");
