import assert from "node:assert/strict";
import {
  COUNTDOWN_START_DAYS,
  countdownToday,
  daysUntilTrip,
  tripCountdownCaption,
} from "../../src/lib/tripCountdown";
import { en } from "../../src/lib/i18n/en";
import { ru } from "../../src/lib/i18n/ru";

// Обратный отсчёт до поездки (src/lib/tripCountdown.ts, АА9): сколько
// дней осталось и какая подпись на этот день. Чистые функции — без БД.
// Запуск:
//
//   npx tsx tests/unit/tripCountdown.test.ts

const d = (iso: string) => new Date(iso);
const today = d("2026-10-01T00:00:00Z");

// --- сколько дней осталось ---

assert.equal(daysUntilTrip(d("2026-10-01T00:00:00Z"), today), 0, "сегодня");
assert.equal(daysUntilTrip(d("2026-10-02T00:00:00Z"), today), 1, "завтра");
assert.equal(daysUntilTrip(d("2026-10-31T00:00:00Z"), today), 30, "ровно месяц");
assert.equal(daysUntilTrip(d("2026-09-30T00:00:00Z"), today), -1, "уже началась");
// Старые записи лежат 21:00 UTC предыдущего дня — тот же день, что и
// новые (см. dayIndex в tripDays.ts).
assert.equal(daysUntilTrip(d("2026-10-25T21:00:00Z"), today), 25, "старый формат даты — 26-е");

// «Сегодня» — календарный день сервера полуночью UTC: 23:30 по местному
// времени — это ещё сегодняшняя дата, а не завтрашняя.
const lateEvening = new Date(2026, 9, 1, 23, 30); // локальная зона процесса
assert.equal(countdownToday(lateEvening).toISOString(), "2026-10-01T00:00:00.000Z", "поздний вечер — тот же день");

// --- подписи ---

for (const [name, dict] of [["en", en], ["ru", ru]] as const) {
  assert.equal(
    dict.notifications.tripCountdown.length,
    COUNTDOWN_START_DAYS + 1,
    `${name}: по подписи на каждый день от 0 до ${COUNTDOWN_START_DAYS}`,
  );
  const seen = new Set<string>();
  for (let days = 0; days <= COUNTDOWN_START_DAYS; days += 1) {
    const caption = tripCountdownCaption(days, dict);
    assert.ok(caption && caption.trim().length > 0, `${name}: день ${days} без подписи`);
    assert.ok(!seen.has(caption), `${name}: день ${days} повторяет чужую подпись`);
    seen.add(caption);
  }
  // За границами отсчёта подписи нет: поездка дальше месяца или уже идёт.
  assert.equal(tripCountdownCaption(COUNTDOWN_START_DAYS + 1, dict), null, `${name}: 31 день — молчим`);
  assert.equal(tripCountdownCaption(-1, dict), null, `${name}: началась — молчим`);
  assert.equal(tripCountdownCaption(2.5, dict), null, `${name}: дробное — молчим`);
}

// Число дней в подписи там, где оно есть цифрой, совпадает с индексом:
// перепутанный порядок в словаре обещал бы «25 дней» за 24 дня.
for (const dict of [en, ru]) {
  dict.notifications.tripCountdown.forEach((caption, days) => {
    const m = caption.match(/^(\d+)\s/);
    if (m) assert.equal(Number(m[1]), days, `подпись «${caption}» стоит под индексом ${days}`);
  });
}

console.log("tripCountdown: ok");
