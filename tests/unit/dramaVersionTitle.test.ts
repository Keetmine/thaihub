import assert from "node:assert/strict";
import {
  hasOriginalStoryRelation,
  parseDramaVersionTitle,
} from "../../src/lib/dramaVersionTitle";

// Отсев альтернативных нарезок при импорте (docs/features/
// mydramalist-import.md). Без базы:
//
//   npx tsx tests/unit/dramaVersionTitle.test.ts

// ---------- маркер через разделитель: решаем по названию ----------

for (const [title, base, marker] of [
  ["Love of Silom (Uncut Ver.)", "Love of Silom", "Uncut Ver."],
  ["Shine (Acoustic Ver.)", "Shine", "Acoustic Ver."],
  ["Pit Babe: Uncut", "Pit Babe", "Uncut"],
  ["Pit Babe Season 2: Uncut", "Pit Babe Season 2", "Uncut"],
  ["Match Play: Re-edited Version", "Match Play", "Re-edited Version"],
  ["Love Mechanics: Director's Cut", "Love Mechanics", "Director's Cut"],
  ["My Plantito (YouTube Cut)", "My Plantito", "YouTube Cut"],
  ["4Minutes (Sultrier Version)", "4Minutes", "Sultrier Version"],
  ["Call It What You Want (2022 Version)", "Call It What You Want", "2022 Version"],
  ["The Boyfriend Express: Vertical Version", "The Boyfriend Express", "Vertical Version"],
  ["Payback (Uncut)", "Payback", "Uncut"],
] as const) {
  const m = parseDramaVersionTitle(title);
  assert.ok(m, `не поймали версию: ${title}`);
  assert.equal(m.base, base, title);
  assert.equal(m.marker, marker, title);
  assert.equal(m.needsProof, false, `${title} — разделитель есть, подтверждение не нужно`);
}

// Двоеточие внутри названия не мешает: важен только последний кусок.
{
  const m = parseDramaVersionTitle("Jack & Joker: U Steal My Heart! (Uncut Ver.)");
  assert.deepEqual(m, {
    base: "Jack & Joker: U Steal My Heart!",
    marker: "Uncut Ver.",
    needsProof: false,
  });
}

// ---------- маркер через пробел: только подозрение ----------

for (const [title, base, marker] of [
  ["Winter Fever Uncut", "Winter Fever", "Uncut"],
  ["Private Lesson Uncut", "Private Lesson", "Uncut"],
  ["Mr. Fanboy Uncut Version", "Mr. Fanboy", "Uncut Version"],
  ["Fairway of Love Uncut Version", "Fairway of Love", "Uncut Version"],
  ["Lovex3 Uncut Version", "Lovex3", "Uncut Version"],
  ["Duang With You Limited Version", "Duang With You", "Limited Version"],
  ["Love Uncut", "Love", "Uncut"],
] as const) {
  const m = parseDramaVersionTitle(title);
  assert.ok(m, `не поймали подозрение: ${title}`);
  assert.equal(m.base, base, title);
  assert.equal(m.marker, marker, title);
  assert.equal(m.needsProof, true, `${title} — только пробел, нужно подтверждение`);
}

// ---------- обычные сериалы не трогаем ----------

for (const title of [
  "Cut", // маркер — всё название целиком, базы нет
  "Behind Cut", // «cut» сам по себе не маркер, только «Director's Cut» и «YouTube Cut»
  "Rose Cuts Diamond",
  "Vice Versa",
  "Our Skyy 2: Vice Versa",
  "The Director Who Buys Me Dinner",
  "Truly Very Yours",
  "Wake Up Ladies Season 2: Very Complicated",
  "Rescue: Special Ops",
  // «Special Episode» — это отдельная серия-бонус, а не другая нарезка:
  // содержание там своё, и удалять такие нельзя.
  "Only Boo! Special",
  "Wedding Plan Special Episode",
  "TharnType Special: Our Final Love",
  "We Best Love: No. 1 For You Special Edition",
]) {
  assert.equal(parseDramaVersionTitle(title), null, `ложное срабатывание: ${title}`);
}

// ---------- подтверждение связью с MDL ----------

// Названия сверяются нестрого: «Mr Fanboy» у базового против
// «Mr. Fanboy …» у версии — это один сериал.
assert.equal(
  hasOriginalStoryRelation("Mr. Fanboy", [
    { relation: "Thai original story", title: "Mr Fanboy" },
  ]),
  true,
);
assert.equal(
  hasOriginalStoryRelation("Lovex3", [{ relation: "Thai original story", title: "LOVEx3" }]),
  true,
);

// Связь есть, но другого рода — не подтверждение.
assert.equal(
  hasOriginalStoryRelation("Pit Babe", [{ relation: "Thai sequel", title: "Pit Babe" }]),
  false,
);
// Связь про другой сериал — тоже нет.
assert.equal(
  hasOriginalStoryRelation("Love", [{ relation: "Thai original story", title: "Love Sea" }]),
  false,
);
// У настоящего сериала связей нет вовсе.
assert.equal(hasOriginalStoryRelation("Love", []), false);

console.log("dramaVersionTitle: все проверки прошли");
