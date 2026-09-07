import assert from "node:assert/strict";
import { verifyDoramaLandMatch } from "../../src/lib/doramalandSync";
import type { DoramaLandPage } from "../../src/lib/doramaland";

// Проверка совпадения с dorama.land (docs/features/doramaland-import.md).
// Заведена после ложного совпадения: нашему тайскому «Reset» досталось
// название китайского сериала. Без сети и базы:
//
//   npx tsx tests/unit/doramalandMatch.test.ts

const page = (over: Partial<DoramaLandPage> = {}): DoramaLandPage => ({
  titleRu: "Возрождение из ледяного озера",
  altTitles: ["Rebirth", "Frozen Awakening", "Bing Hu Chong Sheng"],
  original: "冰湖重生",
  year: 2026,
  country: "Китай",
  genresRu: [],
  episodes: 40,
  descriptionRu: "",
  sourceUrl: "https://dorama.land/vozrozhdenie-iz-ledyanogo-ozera",
  ...over,
});

// ГЛАВНОЕ: тот самый ложный матч. Их «Rebirth» нашёлся подстрокой в
// нашем «The Rebirth of a Star», а страна и вовсе не сверялась.
const reset = {
  title: "Reset",
  nativeTitle: "RESET การเกิดใหม่ของดวงดาว",
  alsoKnownAs: "Kan Koet Mai Khong Duang Dao, The Rebirth of a Star",
  year: 2025,
  country: "Thailand",
};
assert.equal(verifyDoramaLandMatch(reset, page()), false, "Таиланд ≠ Китай");
// Даже без страны у нас подстрока названием не считается.
assert.equal(verifyDoramaLandMatch({ ...reset, country: null }, page()), false);

// Настоящее совпадение по элементу списка целиком — проходит.
assert.equal(
  verifyDoramaLandMatch(
    { title: "Rebirth", nativeTitle: null, alsoKnownAs: null, year: 2026, country: "China" },
    page(),
  ),
  true,
);
assert.equal(
  verifyDoramaLandMatch(
    {
      title: "Что-то ещё",
      nativeTitle: null,
      alsoKnownAs: "Frozen Awakening, Прочее",
      year: 2026,
      country: null,
    },
    page(),
  ),
  true,
  "совпал целый элемент alsoKnownAs",
);

// Страна сверяется, только когда известна у обоих: у части наших
// записей её нет, и это не повод отказываться от перевода.
assert.equal(
  verifyDoramaLandMatch(
    { title: "Rebirth", nativeTitle: null, alsoKnownAs: null, year: 2026, country: null },
    page({ country: "Китай" }),
  ),
  true,
);

// Год: окно ±1, дальше — разные сериалы.
assert.equal(
  verifyDoramaLandMatch(
    { title: "Rebirth", nativeTitle: null, alsoKnownAs: null, year: 2022, country: "China" },
    page(),
  ),
  false,
);

// Тайский оригинал — самый надёжный ключ, названия сверять не нужно.
assert.equal(
  verifyDoramaLandMatch(
    {
      title: "Kan Koet Mai",
      nativeTitle: "การเกิดใหม่",
      alsoKnownAs: null,
      year: 2025,
      country: "Thailand",
    },
    page({ original: "การเกิดใหม่", country: "Таиланд", year: 2025 }),
  ),
  true,
);

console.log("ok: проверка совпадения dorama.land");
