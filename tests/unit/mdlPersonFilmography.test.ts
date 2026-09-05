import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMdlPersonPage } from "../../src/lib/mydramalist";

// Секции фильмографии на странице человека MDL: у каждой таблицы свой
// заголовок `<h5 class="header">` (Drama / Movie / TV Show), и строка
// должна помнить, из какой она (2026-09-05: по секции импорт актёра
// дозаполняет пустой Drama.type — иначе фильмы и шоу не отделить от
// сериалов на странице артиста). Фикстура собрана из живой страницы
// Khaotung: заголовки как есть, по 1-2 строки из каждой таблицы
// (заголовков «Drama» два — основная таблица и добивка, обе секции
// «Drama»). Без сети и без БД. Запуск:
//
//   npx tsx tests/unit/mdlPersonFilmography.test.ts

const html = readFileSync(
  join(__dirname, "fixtures", "mdl-person-filmography.html"),
  "utf8",
);

const person = parseMdlPersonPage(html, "https://mydramalist.com/people/22234-x");

const sections = person.filmography.map((r) => r.section);
assert.ok(person.filmography.length >= 6, "строки из всех четырёх таблиц");
assert.ok(sections.includes("Drama"), "есть строки секции Drama");
assert.ok(sections.includes("Movie"), "есть строка секции Movie");
assert.ok(sections.includes("TV Show"), "есть строки секции TV Show");
assert.ok(
  sections.every((s) => s !== null),
  "у каждой строки под заголовком секция распознана",
);

const movie = person.filmography.find((r) => r.section === "Movie");
assert.equal(movie?.title, "2gether: The Movie", "фильм читается со своей строки");

console.log("mdlPersonFilmography: ok");
