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

// Глухая заглушка (ни JSON-LD, ни og:title) — разбор честно падает.
assert.throws(
  () =>
    parseMdlPersonPage(
      "<html><head><title>Access denied</title></head><body><h1>Blocked</h1></body></html>",
      "https://mydramalist.com/people/25209-mark",
    ),
  /Не удалось разобрать страницу человека/,
  "без имени страница за карточку не выдаётся",
);

// А вот НЕДОГРУЖЕННАЯ страница куда опаснее: head с настоящим og:title
// уже приехал, тела ещё нет — разбор не падает, имя есть, а внутри
// пусто. Импорт актёра принимал такое за успех и отчитывался «обновлён,
// новых полей нет», записав одну ссылку на MDL (жалоба владельца
// 2026-09-25: у Mark Sorntast Buangam на MDL 34 строки фильмографии, у
// нас не привязалось ничего). Поэтому загрузчик в mydramalist.ts ждёт
// не смены заголовка, а размера страницы — по содержимому такую
// половинку от настоящей карточки не отличить, что и проверяем здесь.
const partial = parseMdlPersonPage(
  '<html><head><meta property="og:title" content="Mark Sorntast Buangam" />' +
    "<title>Mark Sorntast Buangam</title></head><body></body></html>",
  "https://mydramalist.com/people/25209-mark",
);
assert.equal(partial.name, "Mark Sorntast Buangam", "имя берётся из og:title и разбор не падает");
assert.equal(partial.born, null, "но даты рождения нет");
assert.equal(partial.bio, null, "и биографии");
assert.equal(partial.filmography.length, 0, "и фильмографии");

console.log("mdlPersonFilmography: ok");
