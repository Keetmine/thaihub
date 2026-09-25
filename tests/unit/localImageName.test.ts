import assert from "node:assert/strict";
import { localImageName } from "../../src/lib/localImage";

// Имя локального файла для скачанной картинки (см. lib/localImage.ts).
// Проверка «файл с таким именем уже на диске — значит, та же картинка»
// держится на том, что имя однозначно задано АДРЕСОМ. Пока имя брали
// из чужого пути, это было неправдой: у WordPress-афиш файл называется
// по размеру, и одним «bnr_1050_486-1.jpg» на a-ara.co.jp названы
// постеры шести разных событий — все они получали картинку первого
// (жалоба владельца 2026-09-25). Без сети и без БД. Запуск:
//
//   npx tsx tests/unit/localImageName.test.ts

// ---------- главное: разные адреса — разные файлы ----------

const a = localImageName("https://www.a-ara.co.jp/wp/wp-content/uploads/2026/08/bnr_1050_486-1.jpg");
const b = localImageName("https://www.a-ara.co.jp/wp/wp-content/uploads/2025/03/bnr_1050_486-1.jpg");
assert.ok(a && b);
assert.notEqual(a.base, b.base, "одинаковое имя файла у разных постеров не склеивает их в один");
assert.ok(a.withExt.startsWith("bnr_1050_486-1-"), "читаемая часть имени сохраняется");
assert.ok(a.withExt.endsWith(".jpg"), "расширение сохраняется");

// ---------- тот же адрес — то же имя ----------

const again = localImageName("https://www.a-ara.co.jp/wp/wp-content/uploads/2026/08/bnr_1050_486-1.jpg");
assert.deepEqual(again, a, "повторная загрузка того же адреса не плодит файлов");

// ---------- своё имя от вызывающего ----------

const named = localImageName("https://example.com/img/1050_486.jpg", { localBase: "aara-gen1-fm" });
assert.ok(named?.base.startsWith("aara-gen1-fm-"), "localBase задаёт читаемую основу");
const namedOther = localImageName("https://example.com/other/1050_486.jpg", { localBase: "aara-gen1-fm" });
assert.notEqual(named?.base, namedOther?.base, "но и с общим localBase адреса не склеиваются");

// ---------- безопасность пути ----------

const traversal = localImageName("https://example.com/a/%2e%2e%2f%2e%2e%2fetc%2fpasswd.jpg");
assert.ok(traversal, "адрес разобран");
assert.ok(!traversal.withExt.includes("/"), "разделителей пути в имени не остаётся");
assert.ok(!traversal.withExt.startsWith("."), "ведущих точек не остаётся");

assert.equal(localImageName("не адрес вовсе"), null, "неразбираемый адрес — null");
assert.equal(localImageName("https://example.com/"), null, "адрес без имени файла — null");

console.log("localImageName: ok");
