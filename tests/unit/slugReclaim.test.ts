import assert from "node:assert/strict";
import { betterSlugFor, splitNumberedSlug } from "../../src/lib/slugReclaim";

// Возврат «чистого» слага после слияния дублей
// (docs/features/duplicates.md). Чистые функции, без сети и базы:
//
//   npx tsx tests/unit/slugReclaim.test.ts

// Ради чего всё затевалось: выживший дубль жил по `nick-2`, а `nick`
// освободился вместе с проигравшим.
assert.equal(betterSlugFor("nick-2", "Nick"), "nick");
assert.equal(betterSlugFor("oh-jung-hwan-2", "Oh Jung Hwan"), "oh-jung-hwan");
// Номер бывает не только вторым.
assert.equal(betterSlugFor("l-3", "L"), "l");

// Ненумерованный слаг не трогаем вовсе.
assert.equal(betterSlugFor("nick", "Nick"), null);
// Как и слаг, который дизамбигуирован именем, а не номером: он
// осмысленный, и ломать сохранённые ссылки ради красоты незачем.
assert.equal(betterSlugFor("tui-kiatkamol-lata", "Tui"), null);

// САМОЕ ВАЖНОЕ: название, которое само кончается цифрой. «-2» тут часть
// имени, а не нумерация — переименование увело бы второй сезон на адрес
// первого.
assert.equal(betterSlugFor("blossom-campus-2", "Blossom Campus 2"), null);
assert.equal(betterSlugFor("love-sea-2", "Love Sea 2"), null);
// А вот дубль второго сезона — законный кандидат.
assert.equal(betterSlugFor("blossom-campus-2-2", "Blossom Campus 2"), "blossom-campus-2");

// Переименованная запись: слаг стабилен при переименовании, и правило
// его не трогает — база с новым названием не совпадает.
assert.equal(betterSlugFor("old-name-2", "Совсем другое название"), null);

// Слага нет (тайское название не транслитерируется) — менять нечего.
assert.equal(betterSlugFor(null, "Nick"), null);

assert.deepEqual(splitNumberedSlug("nick-2"), { base: "nick", n: 2 });
assert.equal(splitNumberedSlug("nick"), null);

console.log("ok: возврат чистого слага после слияния");
