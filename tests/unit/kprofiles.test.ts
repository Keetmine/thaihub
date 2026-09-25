import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  kpPlaceOfBirth,
  kpSocials,
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

console.log("kprofiles: ok");
