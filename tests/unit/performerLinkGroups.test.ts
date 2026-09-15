import assert from "node:assert/strict";
import { buildLinkGroups, groupKey } from "../../src/lib/performerLinkGroups";

// Свои блоки ссылок у артиста (docs/features/catalog.md). Без базы:
//
//   npx tsx tests/unit/performerLinkGroups.test.ts

const link = (label: string, group?: string | null) => ({ label, url: `https://x/${label}`, group });

// Блоки идут в порядке появления, ссылки внутри — тоже.
{
  const g = buildLinkGroups([
    link("Кот", "Питомцы"),
    link("Кафе «У Мью»", "Кафе"),
    link("Собака", "Питомцы"),
  ]);
  assert.deepEqual(g.map((x) => x.title), ["Питомцы", "Кафе"]);
  assert.deepEqual(g[0].links.map((l) => l.label), ["Кот", "Собака"]);
}

// Ссылки без заголовка в блоки не попадают: это обычные кнопки.
{
  const g = buildLinkGroups([link("Instagram"), link("Кот", "Питомцы"), link("Сайт", "")]);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].links.map((l) => l.label), ["Кот"]);
}

// Регистр и лишние пробелы не плодят второй блок; заголовок берётся от
// ПЕРВОЙ ссылки — вторую строку могли набрать с маленькой буквы.
{
  const g = buildLinkGroups([link("Кот", "Питомцы"), link("Собака", "  питомцы ")]);
  assert.equal(g.length, 1);
  assert.equal(g[0].title, "Питомцы");
  assert.equal(g[0].links.length, 2);
}

// Пусто — пустой список, а не блок без ссылок.
assert.deepEqual(buildLinkGroups([]), []);

// Ключ сравнения схлопывает регистр и повторные пробелы.
assert.equal(groupKey("  Мои   Питомцы "), "мои питомцы");

console.log("performerLinkGroups: все проверки прошли");
