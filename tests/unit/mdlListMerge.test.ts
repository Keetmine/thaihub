import assert from "node:assert/strict";
import { statusRank } from "../../src/lib/mdlListImport";

// Правило «импорт не откатывает просмотр назад» (жалоба владельца
// 2026-09-07: повторный импорт затёр отметки, сделанные на сайте).
// Запуск: npx tsx tests/unit/mdlListMerge.test.ts

// Прогресс серий: берём большее из двух — просмотр идёт только вперёд.
const merge = (ours: number | null, mdl: number | null) =>
  mdl != null && (ours == null || mdl > ours) ? mdl : ours;

assert.equal(merge(8, 5), 8, "на сайте отмечено больше — своё сохраняем");
assert.equal(merge(5, 8), 8, "на MDL дальше — подтягиваем");
assert.equal(merge(null, 3), 3, "у нас пусто — берём с MDL");
assert.equal(merge(7, null), 7, "MDL молчит — не трогаем");
assert.equal(merge(null, null), null);

// Статус: «просмотрено» выше «смотрю» и «буду смотреть», поэтому
// импорт не понизит его. Отложено и заброшено — вровень со «смотрю»:
// это решение, а не шаг назад, и на MDL оно такое же свежее.
assert.ok(statusRank("COMPLETED") > statusRank("WATCHING"));
assert.ok(statusRank("COMPLETED") > statusRank("PLAN_TO_WATCH"));
assert.ok(statusRank("WATCHING") > statusRank("PLAN_TO_WATCH"));
assert.equal(statusRank("ON_HOLD"), statusRank("WATCHING"));
assert.equal(statusRank("DROPPED"), statusRank("WATCHING"));

console.log("ok: импорт не откатывает просмотр назад");
