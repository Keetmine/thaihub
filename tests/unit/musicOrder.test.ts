import assert from "node:assert/strict";
import { compareMusicNews, type MusicOrderItem } from "../../src/lib/musicOrder";

// Порядок музыкальных новинок (docs/features/music.md). Без базы:
//
//   npx tsx tests/unit/musicOrder.test.ts

const at = (iso: string) => new Date(iso);
const item = (year: number | null, added: string): MusicOrderItem & { label: string } => ({
  year,
  addedAt: at(added),
  label: `${year}/${added.slice(11, 19)}`,
});
const order = (items: (MusicOrderItem & { label: string })[]) =>
  [...items].sort(compareMusicNews).map((i) => i.label);

// Год главнее всего.
{
  const a = item(2025, "2026-09-10T10:00:00Z");
  const b = item(2026, "2026-08-01T10:00:00Z");
  assert.deepEqual(order([a, b]), [b.label, a.label]);
}

// Внутри года: пачка, приехавшая позже, идёт выше.
{
  const старая = item(2026, "2026-09-05T12:17:23Z");
  const новая = item(2026, "2026-09-10T08:00:00Z");
  assert.deepEqual(order([старая, новая]), [новая.label, старая.label]);
}

// ГЛАВНОЕ: внутри одной пачки порядок вставки = порядок YouTube Music,
// то есть новое сверху. Раньше сортировка переворачивала это.
{
  const первый = item(2026, "2026-09-05T12:17:23Z"); // YTM отдал первым — самый свежий
  const второй = item(2026, "2026-09-05T12:17:24Z");
  const третий = item(2026, "2026-09-05T12:17:25Z");
  assert.deepEqual(order([третий, первый, второй]), [первый.label, второй.label, третий.label]);
}

// Пачка считается по МИНУТЕ: релизы, легшие в соседние минуты, — разные
// пачки, и более поздняя впереди.
{
  const минутаРаньше = item(2026, "2026-09-05T12:17:30Z");
  const минутаПозже = item(2026, "2026-09-05T12:18:01Z");
  assert.deepEqual(order([минутаРаньше, минутаПозже]), [минутаПозже.label, минутаРаньше.label]);
}

// Без года запись уезжает в конец, а не всплывает наверх.
{
  const безГода = item(null, "2026-09-10T10:00:00Z");
  const сГодом = item(2020, "2026-01-01T10:00:00Z");
  assert.deepEqual(order([безГода, сГодом]), [сГодом.label, безГода.label]);
}

// Сортировка устойчива к порядку на входе: тот же набор — тот же ответ.
{
  const набор = [
    item(2026, "2026-09-05T12:17:24Z"),
    item(2026, "2026-09-10T08:00:00Z"),
    item(2025, "2026-09-10T08:00:01Z"),
    item(2026, "2026-09-05T12:17:23Z"),
  ];
  assert.deepEqual(order(набор), order([...набор].reverse()));
}

console.log("musicOrder: все проверки прошли");
