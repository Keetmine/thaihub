import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseTtmListing, canonicalTtmEventUrl } from "../../src/lib/thaiticketmajor";

// Парсер списочных страниц афиши TTM — на сохранённом фрагменте живой
// разметки (2026-09, template v3). Без сети и без БД. Запуск:
//
//   npx tsx tests/unit/ttmListing.test.ts
//
// Фрагмент собран из настоящей /concert/?lang=en и нарочно содержит все
// ловушки: внешние карточки Ticketmaster, чужую категорию /sport/,
// utm-хвосты, дубли карточек (та же афиша и в блоке RECOMMENDED) и
// ссылку из шапки-уведомлений (.noti-item — НЕ карточка списка).

const html = readFileSync(join(__dirname, "fixtures", "ttm-concert-listing.html"), "utf8");

// --- canonicalTtmEventUrl ---

assert.equal(
  canonicalTtmEventUrl("/concert/a-b.html?utm_source=x#top"),
  "https://www.thaiticketmajor.com/concert/a-b.html",
  "относительная ссылка становится абсолютной, query/hash отрезаются",
);
assert.equal(
  canonicalTtmEventUrl("https://www.thaiticketmajor.com/performance/show.html"),
  "https://www.thaiticketmajor.com/performance/show.html",
);
assert.equal(
  canonicalTtmEventUrl("https://thaiticketmajor.com/concert/a.html"),
  "https://www.thaiticketmajor.com/concert/a.html",
  "хост без www канонизируется к www",
);
assert.equal(canonicalTtmEventUrl("https://ticketmaster.co.th/activity/detail/x"), null);
assert.equal(canonicalTtmEventUrl("/sport/muangthong.html"), null, "чужая категория — мимо");
assert.equal(canonicalTtmEventUrl("/concert/"), null, "сама списочная страница — не событие");
assert.equal(canonicalTtmEventUrl("/concert/latest/"), null);
assert.equal(canonicalTtmEventUrl("not a url %"), null);

// --- parseTtmListing ---

const cards = parseTtmListing(html);
const urls = cards.map((c) => c.url);

// Во фрагменте 4 уникальных концертных события; Ticketmaster, /sport/ и
// дубли из RECOMMENDED отсеяны, noti-ссылка из шапки не подобрана.
assert.deepEqual(
  [...urls].sort(),
  [
    "https://www.thaiticketmajor.com/concert/bigbang-2026-2027-world-tour-xx-cosmos-in-bangkok.html",
    "https://www.thaiticketmajor.com/concert/thailand-philharmonic-orchestra-2025-2026.html",
    "https://www.thaiticketmajor.com/concert/wave-to-earth-the-pieces-tour.html",
    "https://www.thaiticketmajor.com/concert/yo-sea-asia-tour-2026-minimum-band-set-live-in-bangkok.html",
  ],
);

const waveToEarth = cards.find((c) => c.url.includes("wave-to-earth"));
assert.equal(waveToEarth?.title, "wave to earth - the pieces tour");

// Названия есть у всех карточек.
for (const card of cards) assert.ok(card.title.length > 0, `пустое название у ${card.url}`);

console.log(`ok: ttmListing (${cards.length} карточек из фикстуры)`);
