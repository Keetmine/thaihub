import assert from "node:assert/strict";
import { parseFandomTarget, fandomApiBase, fandomPageUrl } from "../../src/lib/fandomWiki";

// Разбор ссылок на вики Fandom: импорт работает с ЛЮБЫМ поддоменом
// (правка владельца 2026-09-06), а чужие хосты не пропускаются — по
// адресу из формы админки мы ходим сами. Без сети и без БД. Запуск:
//
//   npx tsx tests/unit/fandomWiki.test.ts

// Хост берётся из ссылки.
assert.deepEqual(parseFandomTarget("https://thiphop.fandom.com/wiki/1MILL"), {
  host: "thiphop.fandom.com",
  title: "1MILL",
});
assert.deepEqual(parseFandomTarget("https://tpop.fandom.com/wiki/BUS"), {
  host: "tpop.fandom.com",
  title: "BUS",
});

// Голое название — вики по умолчанию (так было до правки, ломать нельзя).
assert.deepEqual(parseFandomTarget("BUS"), { host: "tpop.fandom.com", title: "BUS" });

// Относительная ссылка внутри статьи хоста не несёт — берём переданный.
assert.deepEqual(parseFandomTarget("/wiki/Some_Member", "thiphop.fandom.com"), {
  host: "thiphop.fandom.com",
  title: "Some Member",
});

// Подчёркивания — пробелы, процент-кодирование разворачивается, а
// названия вида «100%» не роняют декодер.
assert.equal(parseFandomTarget("https://tpop.fandom.com/wiki/Four_Mix").title, "Four Mix");
assert.equal(parseFandomTarget("https://tpop.fandom.com/wiki/BUS%20(band)").title, "BUS (band)");
assert.equal(parseFandomTarget("100%").title, "100%");

// Языковые вики: префикс /es/ — часть пути, а не названия статьи.
assert.equal(parseFandomTarget("https://drama.fandom.com/es/wiki/Be_On_Cloud").title, "Be On Cloud");

// Чужие хосты и мимикрия под fandom.com не проходят.
for (const bad of [
  "https://evil.example.com/wiki/X",
  "https://fandom.com.evil.net/wiki/X",
  "https://notfandom.com/wiki/X",
]) {
  assert.throws(() => parseFandomTarget(bad), /Fandom/, `должен отбиваться: ${bad}`);
}
assert.throws(() => fandomApiBase("evil.example.com"), /Fandom/);

assert.equal(fandomApiBase("thiphop.fandom.com"), "https://thiphop.fandom.com/api.php");
assert.equal(
  fandomPageUrl("thiphop.fandom.com", "1MILL"),
  "https://thiphop.fandom.com/wiki/1MILL",
);

console.log("fandomWiki: ok");
