import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canonicalThaiStarXUrl,
  isTicketHost,
  parseThaiStarXDateText,
  parseThaiStarXListing,
  parseThaiStarXPost,
  parseThaiStarXTime,
  parseUtcOffset,
  thaiStarXListingPageUrl,
  timezoneForPlace,
} from "../../src/lib/thaiStarX";
import { buildThaiStarXPayload, pickPresaleUrl, ttmUrlFromLinks } from "../../src/lib/thaiStarXCrawl";

// Парсер thaistarx.com (docs/features/thaistarx-crawl.md) — на
// сохранённых фрагментах живой разметки (2026-09-18: <head> без
// скриптов/стилей + <article>, у списка — три статьи и пагинация).
// Без сети и без БД. Запуск:
//
//   npx tsx tests/unit/thaiStarX.test.ts

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

// --- адреса ---

assert.equal(canonicalThaiStarXUrl("https://thaistarx.com/en/forcebook-funtopia-fancon-2026-2/?utm=x#top"), "https://thaistarx.com/en/forcebook-funtopia-fancon-2026-2/");
assert.equal(canonicalThaiStarXUrl("/en/some-post"), "https://thaistarx.com/en/some-post/", "относительный → абсолютный со слешем");
assert.equal(canonicalThaiStarXUrl("https://www.thaistarx.com/en/some-post/"), "https://thaistarx.com/en/some-post/", "www срезается");
assert.equal(canonicalThaiStarXUrl("https://thaistarx.com/en/category/thai-star-events-en/"), null, "рубрика — не пост");
assert.equal(canonicalThaiStarXUrl("https://thaistarx.com/en/tag/gmmtv-en/"), null);
assert.equal(canonicalThaiStarXUrl("https://thaistarx.com/en/thaistar-events-2/"), null, "хаб-страница — не пост");
assert.equal(canonicalThaiStarXUrl("https://thaistarx.com/en/2026/"), null, "архив по году");
assert.equal(canonicalThaiStarXUrl("https://thaistarx.com/ja/some-post/"), null, "не английская версия");
assert.equal(canonicalThaiStarXUrl("https://thaiticketmajor.com/concert/x.html"), null);
assert.equal(thaiStarXListingPageUrl(1), "https://thaistarx.com/en/category/thai-star-events-en/");
assert.equal(thaiStarXListingPageUrl(3), "https://thaistarx.com/en/category/thai-star-events-en/page/3/");

// --- даты из текста ---

assert.deepEqual(parseThaiStarXDateText("Saturday, April 4, 2026"), ["2026-04-04"]);
assert.deepEqual(parseThaiStarXDateText("May 24, 2025 (Saturday)"), ["2025-05-24"]);
assert.deepEqual(parseThaiStarXDateText("June 28 (Sat) & June 29 (Sun), 2025"), ["2025-06-28", "2025-06-29"], "год один на оба дня");
assert.deepEqual(parseThaiStarXDateText("Saturday, July 26 & Sunday, July 27, 2025"), ["2025-07-26", "2025-07-27"]);
assert.deepEqual(parseThaiStarXDateText("June 13–15, 2025"), ["2025-06-13", "2025-06-14", "2025-06-15"], "диапазон разворачивается");
assert.deepEqual(parseThaiStarXDateText("4 October 2025"), ["2025-10-04"], "число перед месяцем");
assert.deepEqual(parseThaiStarXDateText("TBA"), [], "без года — пусто");

// --- время и смещение ---

assert.equal(parseThaiStarXTime("6:30 PM (UTC+9)"), "18:30");
assert.equal(parseThaiStarXTime("18:00 (UTC+8)"), "18:00");
assert.equal(parseThaiStarXTime("17:30 (local time, subject to on-site announcements)"), "17:30");
assert.equal(parseThaiStarXTime("12:00 AM"), "00:00");
assert.equal(parseThaiStarXTime("12 PM"), "12:00");
assert.equal(parseThaiStarXTime("2 nights"), null, "голое число — не время");
assert.equal(parseUtcOffset("5:00 PM (Macau time, UTC +8)"), 8);
assert.equal(parseUtcOffset("10:00 AM (UTC+5:30)"), 5.5);
assert.equal(parseUtcOffset("10:00 AM"), null);

// --- часовой пояс ---

assert.equal(timezoneForPlace("Union Hall, Union Mall, Bangkok, Thailand", null), "Asia/Bangkok");
assert.equal(timezoneForPlace("Broadway Macau – Broadway Theatre", null), "Asia/Macau");
assert.equal(timezoneForPlace("Hanaspace", "18:00 (UTC+8)", "CLO’VER & FELIZZ T-POP SHOWCASE in Taipei 2026"), "Asia/Taipei", "город из названия поста важнее смещения");
assert.equal(timezoneForPlace("Hanaspace", "18:00 (UTC+8)", null), "Asia/Singapore", "только смещение — представительная зона");
assert.equal(timezoneForPlace("Ogden Theatre (935 E Colfax Ave, Denver, Colorado, USA 80218)", null), "America/Denver", "город раньше страны");
assert.equal(timezoneForPlace("Somewhere", null), null);

// --- билетные хосты ---

assert.equal(isTicketHost("https://www.thaiticketmajor.com/concert/x.html"), true);
assert.equal(isTicketHost("https://x.com/GMMTV/status/1"), false);
assert.equal(isTicketHost("https://thaistarx.com/en/x/"), false);
assert.equal(isTicketHost("not a url"), false);

// --- списочная страница ---

const listing = parseThaiStarXListing(fixture("thaistarx-listing.html"), 2);
assert.equal(listing.cards.length, 3, "три статьи фикстуры");
assert.equal(listing.hasNext, true, "у второй страницы есть третья");
const first = listing.cards[0];
assert.equal(first.url, "https://thaistarx.com/en/namtanfilm-fan-meeting-taipei-2026-2/");
assert.equal(first.title, "NamtanFilm Fan Meeting in Taipei 2026");
assert.deepEqual(first.dates, ["2026-01-18"], "дата — из тега tag-20260118-en");
assert.deepEqual(first.tags, ["gmmtv", "namtanfilm"]);
assert.ok(first.categories.includes("fan-meeting") && first.categories.includes("past-events"));
assert.deepEqual(listing.cards[1].tags, ["dew-jirawat", "gmmtv", "offgun"], "теги: сольник «ник-имя», агентство, пейринг");

// --- пост с TTM-ссылкой ---

const post = parseThaiStarXPost(fixture("thaistarx-post.html"), "https://thaistarx.com/en/forcebook-funtopia-fancon-2026-2/");
assert.equal(post.title, "FORCEBOOK FUNTOPIA FANCON 2026");
assert.deepEqual(post.dates, ["2026-04-04"]);
assert.equal(post.dateText, "Saturday, April 4, 2026");
assert.equal(post.startTime, null, "времени в посте нет");
assert.equal(post.venue, "Union Hall, Union Mall, Bangkok, Thailand", "строка про стрим — не продолжение площадки");
assert.equal(post.timezone, "Asia/Bangkok");
assert.ok(post.description?.startsWith("Presented by popular GMMTV duo"), "описание — вступительные абзацы");
assert.ok(!post.description?.includes("Editorial Team") && !post.description?.includes("Table of Contents"), "служебное не попало");
assert.equal(post.posterUrl, "https://thaistarx.com/wp-content/uploads/2026/02/HBLVZEyaMAARxuK.jpg", "полноразмерный из srcset, не -822x1024");
assert.equal(post.presaleDate, "2026-02-28");
assert.equal(post.presaleTime, "10:00");
assert.deepEqual(post.ticketLinks, [{ name: "ThaiTicketMajor", url: "https://www.thaiticketmajor.com/concert/force-book-funtopia-fancon.html" }]);
assert.equal(post.announcementUrl, "https://x.com/GMMTV/status/2022913822571557194?s=20");
assert.ok(post.tags.includes("forcebook") && post.tags.includes("gmmtv"));
assert.ok(post.categories.includes("fancon"));
assert.equal(post.publishedAt, "2026-02-16T10:47:00+08:00");

// --- многодневный пост со временем, членский пресейл ---

const multi = parseThaiStarXPost(fixture("thaistarx-post-multiday.html"), "https://thaistarx.com/en/gmmtv-musicon-japan-2025-2/");
assert.equal(multi.title, "GMMTV MUSICON in Japan 2025");
assert.deepEqual(multi.dates, ["2025-07-26", "2025-07-27"], "два тега-даты");
assert.equal(multi.startTime, "18:30", "«6:30 PM (UTC+9)»");
assert.equal(multi.venue, "Toyosu PIT, Tokyo, Japan");
assert.equal(multi.timezone, "Asia/Tokyo");
assert.equal(multi.presaleDate, "2025-06-16", "общая продажа, а не членский пресейл 13–15 июня");
assert.equal(multi.presaleTime, "18:00");
assert.equal(multi.ticketLinks[0]?.name, "Ticket PIA", "ссылка из строки «Ticketing Platform» — первая, хоть в разметке она ниже");
assert.ok(multi.ticketLinks[0].url.startsWith("https://t.pia.jp/"));
assert.ok(multi.ticketLinks.some((l) => l.name === "Thai-Tai" && /thai-tai\.jp/.test(l.url)), "сайт организатора остаётся справочной ссылкой");

// --- payload черновика ---

assert.equal(ttmUrlFromLinks(post.ticketLinks), "https://www.thaiticketmajor.com/concert/force-book-funtopia-fancon.html");
assert.equal(ttmUrlFromLinks(multi.ticketLinks), null);
assert.equal(pickPresaleUrl(multi.ticketLinks, null)?.startsWith("https://t.pia.jp/"), true);
assert.equal(pickPresaleUrl([{ name: "X", url: "https://x.com/a" }], null), null, "соцсеть — не продажи");

const payload = buildThaiStarXPayload(multi, null, null);
assert.equal(payload.date, "2025-07-26");
assert.deepEqual(payload.extraDates, ["2025-07-27"]);
assert.equal(payload.startTime, "18:30");
assert.equal(payload.timezone, "Asia/Tokyo");
assert.equal(payload.sourceUrl, "https://thaistarx.com/en/gmmtv-musicon-japan-2025-2/");
assert.deepEqual(payload.artists, [], "без TTM состава нет — он из тегов");

const enriched = buildThaiStarXPayload(
  post,
  {
    title: "FORCE BOOK FUNTOPIA FANCON",
    venue: "Union Hall",
    posterUrl: "https://www.thaiticketmajor.com/img_poster/x.jpg",
    date: "2026-04-04",
    startTime: "18:00",
    extraDates: [],
    dateRangeText: null,
    ticketPrice: "2,500 / 3,500 THB",
    description: null,
    presaleDate: "2026-02-28",
    presaleTime: "10:00",
    artists: [{ fullName: "Jiratchapong Srisang", nickname: "Force" }],
    sourceUrl: "https://www.thaiticketmajor.com/concert/force-book-funtopia-fancon.html",
  },
  "https://www.thaiticketmajor.com/concert/force-book-funtopia-fancon.html",
);
assert.equal(enriched.title, "FORCEBOOK FUNTOPIA FANCON 2026", "название — поста");
assert.equal(enriched.startTime, "18:00", "время — с TTM, у поста его не было");
assert.equal(enriched.ticketPrice, "2,500 / 3,500 THB", "цены — с TTM");
assert.equal(enriched.posterUrl, post.posterUrl, "постер — поста (есть у обоих)");
assert.equal(enriched.artists.length, 1, "состав TTM едет в payload");
assert.equal(enriched.presaleUrl, "https://www.thaiticketmajor.com/concert/force-book-funtopia-fancon.html");
assert.equal(enriched.thaiStarX.ttmUrl, enriched.presaleUrl);

console.log("thaiStarX: ok");
