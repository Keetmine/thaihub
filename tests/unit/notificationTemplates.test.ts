import assert from "node:assert/strict";
import {
  NOTIFICATION_TEMPLATES,
  TEMPLATE_GROUPS,
  fillTemplate,
  renderTemplate,
  templateDef,
} from "../../src/lib/notificationTemplates";
import { en } from "../../src/lib/i18n/en";
import { ru } from "../../src/lib/i18n/ru";

// Реестр правящихся из админки текстов (src/lib/notificationTemplates.ts).
// Чистые функции — без БД. Запуск:
//
//   npx tsx tests/unit/notificationTemplates.test.ts

// --- реестр цел ---

const keys = NOTIFICATION_TEMPLATES.map((d) => d.key);
assert.equal(new Set(keys).size, keys.length, "ключи не повторяются");
for (const def of NOTIFICATION_TEMPLATES) {
  assert.ok(
    TEMPLATE_GROUPS.some((g) => g.key === def.group),
    `${def.key}: группа ${def.group} не объявлена`,
  );
  assert.equal(templateDef(def.key), def, `${def.key}: не находится по ключу`);
}

// --- словарный текст содержит ровно свои плейсхолдеры ---

for (const [name, dict] of [["en", en], ["ru", ru]] as const) {
  for (const def of NOTIFICATION_TEMPLATES) {
    const fallback = def.fallback(dict);
    assert.ok(fallback.trim().length > 0, `${name} ${def.key}: пустой текст по умолчанию`);
    for (const v of def.vars) {
      assert.ok(
        fallback.includes(`{${v}}`),
        `${name} ${def.key}: в тексте нет плейсхолдера {${v}}`,
      );
    }
    // Лишних скобок быть не должно: каждая — это необъявленная
    // переменная, которая при отправке останется в сообщении текстом.
    for (const found of fallback.matchAll(/\{(\w+)\}/g)) {
      assert.ok(
        def.vars.includes(found[1]),
        `${name} ${def.key}: плейсхолдер {${found[1]}} не объявлен в vars`,
      );
    }
  }
}

// --- подстановка ---

assert.equal(fillTemplate("{who} и {kto}", { who: "Аня" }), "Аня и {kto}", "чужое остаётся текстом");
assert.equal(fillTemplate("серия {n}", { n: 7 }), "серия 7", "число печатается как есть");

// Правка админки перебивает словарь, пустая — нет (значит «не задано»).
assert.equal(
  renderTemplate("title.FRIEND_REQUEST", { who: "Аня" }, ru),
  "Аня хочет добавить вас в друзья",
);
assert.equal(
  renderTemplate("title.FRIEND_REQUEST", { who: "Аня" }, ru, {
    "title.FRIEND_REQUEST": "{who} стучится в друзья",
  }),
  "Аня стучится в друзья",
  "правка перебивает словарь",
);
assert.equal(
  renderTemplate("title.FRIEND_REQUEST", { who: "Аня" }, ru, { "title.FRIEND_REQUEST": "" }),
  "Аня хочет добавить вас в друзья",
  "пустая правка — это отсутствие правки",
);

// Неизвестный ключ не роняет отрисовку: уведомление важнее текста.
assert.equal(renderTemplate("title.НЕТ_ТАКОГО", {}, ru), "");

console.log("notificationTemplates: ok");
