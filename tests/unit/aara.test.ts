import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildAaraSchedule,
  canonicalAaraUrl,
  parseAaraDates,
  parseAaraEvent,
  parseAaraListing,
  parseAaraShowTimes,
  splitAaraTitle,
} from "../../src/lib/aara";

// Разбор страниц a-ara.co.jp (японский промоутер, см. lib/aara.ts).
// Фикстуры собраны с живых страниц и урезаны: из таблицы события
// оставлены только разбираемые строки, простыни правил выкинуты.
// Без сети и без БД. Запуск:
//
//   npx tsx tests/unit/aara.test.ts

const fixture = (name: string) =>
  readFileSync(join(__dirname, "fixtures", name), "utf8");

// ---------- список ----------

const cards = parseAaraListing(fixture("aara-listing.html"));
assert.equal(cards.length, 4, "четыре карточки из фикстуры");
assert.equal(cards[0].title, "BOSSCKM STORM CHASER IN TOKYO");
assert.equal(cards[0].url, "https://www.a-ara.co.jp/event/bossckm-stormchaser/");
assert.equal(cards[0].postedAt, "2026-09-16", "дата публикации анонса");
assert.ok(
  cards.every((c) => c.url.startsWith("https://www.a-ara.co.jp/event/")),
  "служебные ссылки (feed, страницы пагинации) в список не попадают",
);

// ---------- адреса ----------

assert.equal(
  canonicalAaraUrl("https://www.a-ara.co.jp/event/gen1-fm"),
  "https://www.a-ara.co.jp/event/gen1-fm/",
  "адрес приводится к виду со слэшем",
);
assert.equal(canonicalAaraUrl("https://www.a-ara.co.jp/event/feed/"), null, "feed — не событие");
assert.equal(canonicalAaraUrl("https://www.a-ara.co.jp/event/page/2/"), null, "страница списка — не событие");
assert.equal(canonicalAaraUrl("https://example.com/event/x/"), null, "чужой хост");

// ---------- даты и время ----------

assert.deepEqual(parseAaraDates("2026年12月20日( 日 )"), ["2026-12-20"]);
assert.deepEqual(
  parseAaraDates("2026年11月21日(土) と 2026年11月22日(日)"),
  ["2026-11-21", "2026-11-22"],
  "двухдневные гастроли одной карточкой",
);

assert.deepEqual(
  parseAaraShowTimes("1回目 13：15 開場 / 14：00 開演 2回目 17：45 開場 / 18：30 開演"),
  ["14:00", "18:30"],
  "два сеанса — два времени НАЧАЛА, не открытия дверей",
);
assert.deepEqual(
  parseAaraShowTimes("開場１７：４５ / 開演１８：３０"),
  ["18:30"],
  "полноширинные цифры и обратный порядок подписи",
);
assert.deepEqual(
  parseAaraShowTimes("サイン会A 12：00スタート (11：30開場) サイン会B 16：00スタート (15：30開場)"),
  ["12:00", "16:00"],
  "у фансайнов начало помечено «スタート»",
);
assert.deepEqual(
  parseAaraShowTimes("13：30 開場のみ"),
  ["13:30"],
  "нет ни 開演, ни スタート — берём открытие дверей",
);
assert.deepEqual(parseAaraShowTimes("時間未定"), [], "времени нет — и не выдумываем");

// ---------- раскладка дней и сеансов ----------

assert.deepEqual(
  buildAaraSchedule(["2026-12-20"], ["14:00", "18:30"], "1回目 14：00 開演 2回目 18：30 開演"),
  { slots: [{ date: "2026-12-20", time: "14:00" }, { date: "2026-12-20", time: "18:30" }], ambiguous: false },
  "один день, два сеанса",
);
assert.deepEqual(
  buildAaraSchedule(["2026-01-30", "2026-01-31"], ["18:30"], "…"),
  {
    slots: [{ date: "2026-01-30", time: "18:30" }, { date: "2026-01-31", time: "18:30" }],
    ambiguous: false,
  },
  "одно время на оба дня",
);
assert.deepEqual(
  buildAaraSchedule(["2025-05-22", "2025-05-24"], ["18:30", "17:00"], "без пометок"),
  {
    slots: [{ date: "2025-05-22", time: "18:30" }, { date: "2025-05-24", time: "17:00" }],
    ambiguous: false,
  },
  "времён столько же, сколько дней — по одному на день",
);
// «回目» размечает сеансы ОДНОГО дня, поэтому у двухдневных гастролей
// каждый день идёт по полному расписанию, а не по одному сеансу.
assert.deepEqual(
  buildAaraSchedule(["2026-01-10", "2026-01-11"], ["13:00", "17:30"], "1回目 13：00 開演 2回目 17：30 開演").slots
    .length,
  4,
  "два дня × два сеанса",
);
const messy = buildAaraSchedule(["2025-04-26", "2025-04-29", "2025-04-30"], ["18:00", "16:00"], "…");
assert.equal(messy.ambiguous, true, "три дня и два времени — раскладку не выдумываем");
assert.equal(messy.slots[0].time, "18:00");
assert.equal(messy.slots[1].time, null, "лишним дням время не приписываем");

// ---------- пометки в заголовке ----------

assert.deepEqual(splitAaraTitle("【Benefit】UP POOM FANMEETING IN JAPAN"), {
  variant: "Benefit",
  base: "UP POOM FANMEETING IN JAPAN",
});
assert.deepEqual(splitAaraTitle("UP POOM FANMEETING IN JAPAN"), {
  variant: null,
  base: "UP POOM FANMEETING IN JAPAN",
});

// ---------- страница события ----------

const event = parseAaraEvent(
  fixture("aara-event.html"),
  "https://www.a-ara.co.jp/event/gen1-fm/",
);
assert.equal(event.title, "DMD GEN1 Christmas Fanmeeting in Japan");
assert.equal(event.standalone, true, "есть дата — событие самостоятельное");
assert.deepEqual(event.dates, ["2026-12-20"]);
assert.deepEqual(event.times, ["14:00", "18:30"], "два сеанса в один день");
assert.equal(event.venue, "品川ザ・グランドホール", "город из хвоста вынесен отдельно");
assert.equal(event.city, "東京");
assert.ok(event.lineupText?.includes("GEN1"), "строка состава читается");
assert.ok(event.lineupText?.includes("ZEE"), "участники группы в скобках — тоже");
assert.equal(event.kindText, "ファンミーティング");

// Поля читаются ПО ПОДПИСИ: на части страниц 会場 стоит выше 出演, и
// разбор по порядку строк перепутал бы место с составом.
assert.notEqual(event.venue, event.lineupText, "место и состав не перепутаны");

// ---------- карточка-допродажа ----------

const variant = parseAaraEvent(
  fixture("aara-event-variant.html"),
  "https://www.a-ara.co.jp/event/fanbenefit-dmd/",
);
assert.equal(variant.standalone, false, "у допродажи нет таблицы с датой — событием не считаем");
assert.deepEqual(variant.dates, []);
assert.equal(variant.variant, "FanBenefit", "пометка из заголовка отделена");

console.log("aara: ok");
