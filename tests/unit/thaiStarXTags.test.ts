import assert from "node:assert/strict";
import { matchTagsAgainstCatalog, type TagCatalog } from "../../src/lib/performerMatching";

// Матчинг тегов thaistarx.com по каталогу (docs/features/thaistarx-crawl.md)
// — чистая функция на синтетическом каталоге. Без сети и БД. Запуск:
//
//   npx tsx tests/unit/thaiStarXTags.test.ts

const P = (id: string, name: string, realName: string | null = null, musicAlias: string | null = null, type: "SOLO" | "BAND" = "SOLO") => ({ id, name, realName, musicAlias, birthYear: null, type });
const catalog: TagCatalog = {
  performers: [
    P("william", "William", "Jakrapatr Kaewpanpong"),
    P("est", "Est", "Supha Sangaworawong"),
    P("namtan1", "Namtan", "Tipnaree Weerasakchai"),
    P("namtan2", "Namtan", "Somebody Else"),
    P("gun1", "Gun", "Atthaphan Phunsawat"),
    P("gun2", "GUN", "Napat Injaieua"),
    P("lykn", "LYKN", null, null, "BAND"),
    P("jasper", "JASP.ER", null, null, "BAND"),
    P("boss", "Boss", "Chaikamon Sermsongswad", "BOSS.CKM"),
    P("mascot", "Milky", null),
    P("milk", "Milk", "Pansa Vosbein"),
    P("love", "Love", "Pattranite Limpatiyakorn"),
    P("nam", "Nam", null),
    P("tan", "Tan", null),
  ],
  pairings: [{ performerAId: "william", performerBId: "est", nameA: "William", nameB: "Est" }],
};

const ids = (tags: string[]) => matchTagsAgainstCatalog(tags, catalog).matched.map((m) => m.performerId);

// 1. Пейринг — оба участника, порядок ников любой.
assert.deepEqual(ids(["williamest"]), ["william", "est"]);
assert.deepEqual(ids(["estwilliam"]), ["william", "est"]);

// 2. Ник/алиас целиком: регистр, дефисы и точки не мешают.
assert.deepEqual(ids(["lykn"]), ["lykn"]);
assert.deepEqual(ids(["jasp-er"]), ["jasper"], "«jasp-er» = JASP.ER");
assert.deepEqual(ids(["boss-ckm"]), ["boss"], "музыкальный алиас");

// 3. «ник-имя»: тёзки разводятся началом реального имени.
assert.deepEqual(ids(["namtan-tipnaree"]), ["namtan1"]);
const r = matchTagsAgainstCatalog(["namtan-unknown"], catalog);
assert.deepEqual(r.matched, [], "подсказка никого не выбрала — привязки нет");
assert.equal(r.ambiguous.length, 1);
assert.equal(r.ambiguous[0].nickname, "namtan");
assert.equal(r.ambiguous[0].candidates.length, 2, "обе Namtan — владельцу на выбор");

// 4. Тёзки без подсказки — тоже вопрос владельцу, не случайный выбор.
const g = matchTagsAgainstCatalog(["gun"], catalog);
assert.deepEqual(g.matched, []);
assert.equal(g.ambiguous[0]?.candidates.length, 2);

// 5. Незнакомое (агентства) и даты — мимо, без ошибок.
const u = matchTagsAgainstCatalog(["gmmtv", "20260404", "ch3-thailand"], catalog);
assert.deepEqual(u.matched, []);
assert.deepEqual(u.unmatched, ["gmmtv", "ch3-thailand"], "даты отброшены молча");

// 2б. Склейка двух ников без пейринга: обе — уникальные ники.
assert.deepEqual(ids(["milklove"]), ["milk", "love"], "MilkLove без Pairing в каталоге");
assert.deepEqual(ids(["namtan"]), ["namtan1"].filter(() => false), "«namtan» — тёзки целиком, на Nam + Tan не режется");
assert.equal(matchTagsAgainstCatalog(["namtan"], catalog).ambiguous[0]?.candidates.length, 2);
assert.deepEqual(ids(["milkgun"]), [], "половина с тёзками (два Gun) — мимо, наугад не режем");

// 6. Один человек из двух тегов — одна привязка.
assert.deepEqual(ids(["williamest", "est"]), ["william", "est"]);

console.log("thaiStarXTags: ok");
