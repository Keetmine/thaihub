import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  kpPlaceOfBirth,
  kpSocials,
  matchKpToCatalog,
  normalizeKpProfile,
  parseKpBirthday,
  parseKpBloodType,
  parseKpHandle,
  parseKpHeight,
  parseKpMbti,
  parseKpPage,
  parseKpWeight,
} from "../../src/lib/kprofiles";

// Разбор профилей kprofiles.com (lib/kprofiles.ts) — разовый источник
// фактов и полей карточки артиста. Фикстуры урезаны с живых страниц.
// Без сети и без БД. Запуск:
//
//   npx tsx tests/unit/kprofiles.test.ts

const fixture = (n: string) => readFileSync(join(__dirname, "fixtures", n), "utf8");

// ---------- страница одиночки: подпись стоит ДО профиля ----------
const solo = parseKpPage(fixture("kprofiles-solo.html"), "https://kprofiles.com/chokun-puttipong-profile/");
assert.equal(solo.length, 1, "на странице одиночки один профиль");
assert.equal(solo[0].stageName, "Chokun");
assert.equal(solo[0].stageNameThai, "โชกุน", "тайское написание — даже со скобкой «}» вместо «)»");
assert.ok(solo[0].signatureUrl?.includes("chokun-signature"), "подпись подхвачена, хотя стоит раньше блока профиля");
assert.ok(!solo[0].signatureUrl?.includes(" "), "из img берётся src, а не srcset");
assert.ok(solo[0].facts.length >= 3, "факты читаются");
assert.equal(solo[0].fields["Nationality"], "Thai");

// ---------- страница группы: несколько участников ----------
const group = parseKpPage(fixture("kprofiles-group.html"), "https://kprofiles.com/domundi-members-profile-facts/");
assert.equal(group.length, 2, "два участника из фикстуры");
assert.equal(group[0].stageName, "Mark");
assert.equal(group[0].birthName, "Sorntast Buangam");
assert.equal(group[0].birthNameThai, "สรณ์ธรรศ บัวงาม");
assert.equal(group[0].fields["Birthday"], "March 9, 1992");
assert.ok(group[0].facts.some((f) => /Lopburi/.test(f)), "факты того участника, а не соседа");
assert.equal(group[1].stageName, "Park");
assert.ok(group[1].facts.every((f) => !/Lopburi/.test(f)), "факты не перетекают между участниками");
assert.equal(group[0].fields["X"], "@Msorntast", "ключ из одной буквы (X) читается");

// ---------- нормализация ----------
assert.equal(parseKpBirthday("March 9, 1992"), "1992-03-09");
assert.equal(parseKpBirthday("December 05, 2002"), "2002-12-05");
assert.equal(parseKpBirthday("9 March 1992"), "1992-03-09");
assert.equal(parseKpBirthday("March 9"), null, "без года — не дата");
assert.equal(parseKpHeight("179 cm (5’10”)"), "179 cm");
assert.equal(parseKpHeight("5’10”"), null, "футы не пересчитываем");
assert.equal(parseKpWeight("70 kg (154 lbs)"), "70 kg");
assert.equal(parseKpBloodType("O"), "O");
assert.equal(parseKpBloodType("AB (Rh+)"), "AB");
assert.equal(parseKpBloodType("N/A"), null);
assert.equal(parseKpMbti("ENFJ-T"), "ENFJ", "подтип -T не храним");
assert.equal(parseKpMbti("INFJ (Advocate)"), "INFJ");
assert.equal(parseKpMbti("N/A"), null);
assert.equal(parseKpHandle("@mark_sorntast"), "mark_sorntast");
assert.equal(parseKpHandle("https://www.instagram.com/auautnp"), "auautnp");
assert.equal(parseKpHandle("Chuejaipark เชื่อใจป๊าก"), null, "название страницы, не хэндл");
assert.deepEqual(
  kpSocials({ Instagram: "@a", Twitter: "@b", TikTok: "@c", Facebook: "Some Page" }),
  [{ platform: "instagram", handle: "a" }, { platform: "x", handle: "b" }, { platform: "tiktok", handle: "c" }],
);
assert.equal(kpPlaceOfBirth(["He was born in Lopburi, Thailand.", "He likes cats."]), "Lopburi, Thailand");
assert.equal(kpPlaceOfBirth(["He was born on a Tuesday."]), null, "только «born in <Место>»");

const n = normalizeKpProfile(group[0]);
assert.equal(n.birthDate, "1992-03-09");
assert.equal(n.height, "179 cm");
assert.equal(n.bloodType, "O");
assert.equal(n.mbti, null, "N/A → пусто");
assert.equal(n.placeOfBirth, "Lopburi, Thailand");
assert.equal(n.socials.find((s) => s.platform === "instagram")?.handle, "mark_sorntast");

// ---------- сопоставление с каталогом ----------
const rows = [
  { id: "bright", name: "Bright", realName: "Vachirawit Chiva-aree", alsoKnownAs: null, instagram: ["bbrightvc"] },
  { id: "jeff", name: "Jeff", realName: "Worakamol Satur", alsoKnownAs: null, instagram: [] },
  { id: "becky", name: "Becky", realName: "Rebecca Armstrong", alsoKnownAs: null, instagram: [] },
  { id: "boss1", name: "Boss", realName: "Chaikamon Sermsongwittaya", alsoKnownAs: null, instagram: [] },
  { id: "boss2", name: "Boss", realName: "Pongpak Pimsarn", alsoKnownAs: null, instagram: [] },
  { id: "noeul", name: "Noeul", realName: "Nuttarat Tangwai", alsoKnownAs: null, instagram: [] },
];
const m = (stageName: string | null, birthName: string | null, ig?: string) =>
  matchKpToCatalog({ stageName, birthName, socials: ig ? [{ platform: "instagram", handle: ig }] : [] }, rows);

assert.deepEqual(m("Bright", "Somebody Else", "BBrightVC"), { performerId: "bright", via: "instagram" }, "инстаграм — сильнее имени");
assert.deepEqual(m("Bright", "Vachirawit Chivaaree"), { performerId: "bright", via: "realName" }, "дефис в имени не мешает");
assert.deepEqual(m("Becky", "Rebecca Patricia Armstrong"), { performerId: "becky", via: "tokens" }, "имя с отчеством ⊃ имя без");
assert.deepEqual(m("Jeff Satur", null), { performerId: "jeff", via: "nickname" }, "ник + фамилия без строки Birth Name");
assert.deepEqual(m("Noeul", null), { performerId: "noeul", via: "nickname" }, "одинокий ник — только если он у нас один");
assert.equal(m("Boss", null).performerId, null, "«Boss» — их несколько, не угадываем");
assert.equal(m("Boss", null).via, "ambiguous");
assert.equal(m("Ryujin", "Tinnapat Tusnytraitrep").via, "none", "незнакомый — новая карточка");
const rows2 = [...rows, { id: "nat", name: "Nat", realName: "Natasit Uareksit", alsoKnownAs: null, instagram: [] }];
assert.equal(
  matchKpToCatalog({ stageName: "Nat", birthName: "Natasitt Uareksit", socials: [] }, rows2).performerId,
  "nat",
  "ник + фамилия совпали — транслитерация имени не мешает",
);
assert.equal(
  matchKpToCatalog({ stageName: "Mew", birthName: "Chisanucha Tantimedh", socials: [] }, [
    ...rows, { id: "mewS", name: "Mew", realName: "Suppasit Jongcheveevat", alsoKnownAs: null, instagram: [] },
  ]).performerId,
  null,
  "тот же ник, другая фамилия — не наш человек",
);

console.log("kprofiles: ok");
