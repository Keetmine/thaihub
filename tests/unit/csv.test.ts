import assert from "node:assert/strict";
import { csvFileName, formatDate, formatDateTime, toCsv } from "../../src/lib/csv";

// Выгрузка своих данных таблицей (АА16). Запуск:
//
//   npx tsx tests/unit/csv.test.ts

// Разделитель — точка с запятой: файл открывают в Excel с русской
// локалью, а он в ней ждёт именно её.
const simple = toCsv(["Название", "Год"], [["Сериал", 2026]]);
assert.ok(simple.startsWith("﻿"), "в начале BOM — иначе Excel читает кириллицу как кракозябры");
assert.equal(
  simple,
  "﻿Название;Год\r\nСериал;2026\r\n",
  "заголовки, разделитель и переводы строк CRLF",
);

// Экранирование по RFC 4180: кавычки удваиваются, поля с разделителем,
// кавычкой или переносом строки берутся в кавычки.
const tricky = toCsv(
  ["Поле"],
  [["точка с запятой; внутри"], ['кавычка "внутри"'], ["перенос\nстроки"], [""]],
);
assert.ok(tricky.includes('"точка с запятой; внутри"'), "разделитель прячется в кавычки");
assert.ok(tricky.includes('"кавычка ""внутри"""'), "кавычки удваиваются");
assert.ok(tricky.includes('"перенос\nстроки"'), "перенос строки прячется в кавычки");

// Пустые значения — просто пустая ячейка, без «null» и «undefined».
const empties = toCsv(["A", "B", "C"], [[null, undefined, ""]]);
assert.equal(empties, "﻿A;B;C\r\n;;\r\n", "ничего лишнего в пустых ячейках");

// Даты — в машиночитаемом виде: так они сортируются как текст и
// одинаково читаются в любой локали.
assert.equal(formatDate(new Date("2026-10-18T21:00:00.000Z")), "2026-10-18");
assert.equal(formatDateTime(new Date("2026-10-18T19:30:00.000Z")), "2026-10-18 19:30");
const dated = toCsv(["Дата"], [[new Date("2026-01-05T00:00:00.000Z")]]);
assert.ok(dated.includes("2026-01-05"), "дата в ячейке форматируется сама");

// Имя файла — с разделом и датой выгрузки.
assert.equal(
  csvFileName("сериалы", new Date("2026-09-06T10:00:00.000Z")),
  "myblhub-сериалы-2026-09-06.csv",
);

console.log("ok: выгрузка в CSV");
