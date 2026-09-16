import assert from "node:assert/strict";
import {
  amountToInput,
  budgetProgress,
  byCategory,
  formatMoney,
  parseAmount,
  parseCategory,
  parseCurrency,
  totalsByCurrency,
  type ExpenseLike,
} from "../../src/lib/tripMoney";

// Деньги поездки (src/lib/tripMoney.ts). Чистые функции:
//
//   npx tsx tests/unit/tripMoney.test.ts

// --- parseAmount: как люди правда пишут суммы ---
assert.equal(parseAmount("1200"), 120000, "целое");
assert.equal(parseAmount("1200.50"), 120050, "точка");
assert.equal(parseAmount("1200,50"), 120050, "запятая");
assert.equal(parseAmount("1 200,50"), 120050, "пробел-разделитель");
assert.equal(parseAmount("1 200"), 120000, "неразрывный пробел из копипасты");
assert.equal(parseAmount("1200 ฿"), 120000, "значок валюты рядом");
assert.equal(parseAmount("0.5"), 50, "меньше единицы");
// Округление, а не отбрасывание: 10.555 это 10.56, а не 10.55.
assert.equal(parseAmount("10.555"), 1056, "третий знак округляется");

// Не деньги — это null, а не ноль: форма обязана сказать.
assert.equal(parseAmount(""), null, "пусто");
assert.equal(parseAmount("   "), null, "одни пробелы");
assert.equal(parseAmount("бесплатно"), null, "буквы");
assert.equal(parseAmount("0"), null, "ноль — не трата");
assert.equal(parseAmount("0,00"), null, "ноль копейками — тоже");
assert.equal(parseAmount("-500"), null, "минус — это возврат, а не трата");
assert.equal(parseAmount("1.2.3"), null, "две точки — опечатка, а не число");
assert.equal(parseAmount("99999999999"), null, "случайно вставленный телефон не роняет запрос");

// --- amountToInput: обратно в поле правки, без разделителей разрядов ---
assert.equal(amountToInput(120000), "1200");
assert.equal(amountToInput(120050), "1200.50");
assert.equal(amountToInput(50), "0.50");
// Круг: что показали в поле, то и разберётся обратно тем же числом.
for (const minor of [1, 50, 120000, 120050, 999999]) {
  assert.equal(parseAmount(amountToInput(minor)), minor, `круг по ${minor}`);
}

// --- parseCurrency / parseCategory: мусор из формы не роняет страницу ---
assert.equal(parseCurrency("RUB"), "RUB");
assert.equal(parseCurrency("EUR"), "THB", "неизвестная валюта — бат");
assert.equal(parseCurrency(undefined), "THB");
assert.equal(parseCategory("FOOD"), "FOOD");
assert.equal(parseCategory("../x"), "OTHER");

// --- formatMoney ---
// Копейки показываются, только когда они есть.
assert.ok(!formatMoney(120000, "THB", "ru").includes(","), "круглая сумма без копеек");
assert.ok(formatMoney(120050, "THB", "ru").includes("50"), "копейки на месте");

// --- totalsByCurrency ---
const list: ExpenseLike[] = [
  { amountMinor: 300000, currency: "THB", category: "STAY" },
  { amountMinor: 120000, currency: "THB", category: "FOOD" },
  { amountMinor: 5000000, currency: "RUB", category: "FLIGHT" },
  { amountMinor: 20000, currency: "THB", category: "FOOD" },
];
assert.deepEqual(totalsByCurrency(list), [
  { currency: "RUB", total: 5000000 },
  { currency: "THB", total: 440000 },
]);
assert.deepEqual(totalsByCurrency([]), [], "нет трат — нет строк");
// Валюты, которой не было, в итогах не появляется.
assert.ok(!totalsByCurrency(list).some((t) => t.currency === "USD"));

// --- byCategory: считаем ВНУТРИ валюты, баты с рублями не складываем ---
const cats = byCategory(list, "THB");
assert.deepEqual(
  cats.map((c) => c.category),
  ["STAY", "FOOD"],
  "по убыванию суммы",
);
assert.equal(cats[0].total, 300000);
assert.equal(cats[1].total, 140000, "две строки еды сложились");
// Доли считаются от итога СВОЕЙ валюты (440000), а не от всего.
assert.ok(Math.abs(cats[0].share - 300000 / 440000) < 1e-9);
assert.ok(Math.abs(cats.reduce((s, c) => s + c.share, 0) - 1) < 1e-9, "доли дают единицу");
assert.deepEqual(byCategory(list, "USD"), [], "валюты нет — разбивки нет");
assert.deepEqual(byCategory([], "THB"), []);

// --- budgetProgress ---
assert.deepEqual(budgetProgress(50000, 100000), { share: 0.5, over: 0 });
assert.deepEqual(budgetProgress(0, 100000), { share: 0, over: 0 });
// Перерасход виден числом, а полоса не вылезает за дорожку.
assert.deepEqual(budgetProgress(150000, 100000), { share: 1, over: 50000 });
assert.deepEqual(budgetProgress(50000, 0), { share: 0, over: 0 }, "бюджета нет — делить не на что");

console.log("tripMoney.test.ts: ok");
