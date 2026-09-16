import assert from "node:assert/strict";
import { CATALOG_KINDS, kindHref, kindWhere, parseKind } from "../../src/lib/catalogKinds";

// Разделы каталога (src/lib/catalogKinds.ts). Чистые функции, без БД:
//
//   npx tsx tests/unit/catalogKinds.test.ts

// --- parseKind: мусор из адреса не должен ронять страницу ---
assert.equal(parseKind("movie"), "movie");
assert.equal(parseKind("show"), "show");
assert.equal(parseKind("novels"), "novels");
assert.equal(parseKind(undefined), "series", "без параметра — сериалы");
assert.equal(parseKind(""), "series", "пустая строка — сериалы");
assert.equal(parseKind("drama"), "series", "неизвестный раздел — сериалы");
assert.equal(parseKind("../etc"), "series", "мусор — сериалы");

// --- kindHref: сериалы без хвоста, новеллы на свою страницу ---
assert.equal(kindHref("series"), "/dramas");
assert.equal(kindHref("movie"), "/dramas?kind=movie");
assert.equal(kindHref("show"), "/dramas?kind=show");
assert.equal(kindHref("novels"), "/novels");

// Адрес раздела обязан разбираться обратно в тот же раздел — иначе чип
// подсветится не тот, по которому кликнули.
for (const kind of CATALOG_KINDS) {
  const href = kindHref(kind);
  const raw = new URL(href, "https://myblhub.com").searchParams.get("kind") ?? undefined;
  const back = kind === "novels" ? "novels" : parseKind(raw);
  assert.equal(back, kind, `круг по ${kind}`);
}

// --- kindWhere ---
// Запись без типа должна попадать в «Сериалы»: их проставила миграция
// 20260916T01, но скрипт мог записать явный null, и пропасть из
// каталога такая запись не должна.
assert.deepEqual(kindWhere("series"), {
  OR: [{ type: { in: ["Drama"] } }, { type: null }],
});
assert.deepEqual(kindWhere("movie"), { type: { in: ["Movie"] } });
// «TV Show» и «TV Program» для зрителя одно и то же — оба «Шоу».
assert.deepEqual(kindWhere("show"), { type: { in: ["TV Show", "TV Program"] } });
// Новеллы живут на своей странице — фильтра по Drama у них нет.
assert.deepEqual(kindWhere("novels"), {});

// Ни один тип не попадает в два раздела сразу.
const seen = new Set<string>();
for (const kind of ["series", "movie", "show"] as const) {
  const w = kindWhere(kind) as { type?: { in: string[] }; OR?: { type?: { in: string[] } }[] };
  const types = w.type?.in ?? w.OR?.[0]?.type?.in ?? [];
  for (const t of types) {
    assert.ok(!seen.has(t), `тип ${t} попал в два раздела`);
    seen.add(t);
  }
}

console.log("catalogKinds.test.ts: ok");
