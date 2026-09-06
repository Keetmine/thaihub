import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canonicalMusicFestivalArtistUrl,
  canonicalMusicFestivalUrl,
  formatTicketPrice,
  musicFestivalListingPageUrl,
  parseMusicFestivalArtist,
  parseMusicFestivalDates,
  parseMusicFestivalListing,
  parseMusicFestivalPage,
  parseMusicFestivalShowtime,
} from "../../src/lib/musicFestival";

// Парсер musicfestival.in.th (docs/features/musicfestival-import.md) —
// на сохранённых фрагментах живых страниц (2026-09-05, галерея Showtime
// — 2026-09-06; вырезаны только <script>/<style>/<link> и футер, у
// «богатого» фестиваля лента лайнапа обрезана до четырёх карточек, у
// Monster оставлены галереи и по паре соседних чужих картинок). Без сети
// и без БД. Запуск:
//
//   npx tsx tests/unit/musicFestival.test.ts

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

// --- адреса ---

assert.equal(
  canonicalMusicFestivalUrl("/en/festivals/big-wild-life-khao-yai"),
  "https://www.musicfestival.in.th/en/festivals/big-wild-life-khao-yai",
);
assert.equal(
  canonicalMusicFestivalUrl("https://musicfestival.in.th/festivals/bmmf-16?x=1#top"),
  "https://www.musicfestival.in.th/en/festivals/bmmf-16",
  "тайская версия без /en и query приводится к английской",
);
assert.equal(canonicalMusicFestivalUrl("/th/festivals/g27"), "https://www.musicfestival.in.th/en/festivals/g27");
assert.equal(canonicalMusicFestivalUrl("/en/festivals"), null, "сам список — не фестиваль");
assert.equal(canonicalMusicFestivalUrl("/en/past-festivals"), null);
assert.equal(canonicalMusicFestivalUrl("/genre/rock?tab=festivals"), null);
assert.equal(canonicalMusicFestivalUrl("https://www.allticket.com/event/X"), null, "чужой сайт");
assert.equal(
  canonicalMusicFestivalArtistUrl("/en/artists/loso"),
  "https://www.musicfestival.in.th/en/artists/loso",
);
assert.equal(canonicalMusicFestivalArtistUrl("/en/artists"), null);
assert.equal(musicFestivalListingPageUrl("https://x/en/festivals", 0), "https://x/en/festivals");
assert.equal(musicFestivalListingPageUrl("https://x/en/festivals", 24), "https://x/en/festivals?offset=24");

// --- даты ---

assert.deepEqual(parseMusicFestivalDates("16 October 2026"), ["2026-10-16"]);
assert.deepEqual(parseMusicFestivalDates("12–13 December 2026"), ["2026-12-12", "2026-12-13"]);
assert.deepEqual(parseMusicFestivalDates("29-30 August 2026"), ["2026-08-29", "2026-08-30"], "дефис = тире");
assert.deepEqual(
  parseMusicFestivalDates("31 October – 2 November 2026"),
  ["2026-10-31", "2026-11-01", "2026-11-02"],
  "диапазон через границу месяца разворачивается целиком",
);
assert.deepEqual(
  parseMusicFestivalDates("30 December 2026 – 1 January 2027"),
  ["2026-12-30", "2026-12-31", "2027-01-01"],
);
assert.deepEqual(
  parseMusicFestivalDates("30 December – 1 January 2027"),
  ["2026-12-30", "2026-12-31", "2027-01-01"],
  "начало в декабре, конец в январе — год начала на единицу меньше",
);
assert.deepEqual(parseMusicFestivalDates("Coming soon"), []);
assert.deepEqual(parseMusicFestivalDates(null), []);
assert.equal(parseMusicFestivalDates("1 – 30 March 2026").length, 14, "потолок 14 дней");

// --- цена билетов одной строкой ---

assert.equal(
  formatTicketPrice([
    { name: "Pre Early Bird", price: "690 THB", note: null },
    { name: "General", price: "1,800 THB", note: "note" },
  ]),
  "Pre Early Bird 690 / General 1,800 THB",
);
assert.equal(formatTicketPrice([]), null);
assert.equal(
  formatTicketPrice([{ name: "A", price: "Free", note: null }]),
  "A Free",
  "непарсящаяся цена — как есть, без общей валюты",
);

// --- список ---

const listing = parseMusicFestivalListing(fixture("musicfestival-listing.html"));
assert.equal(listing.cards.length, 12, "12 карточек на странице");
assert.equal(listing.hasMore, true, "флаг «есть ещё» из loader-данных");
assert.deepEqual(listing.cards[0], {
  url: "https://www.musicfestival.in.th/en/festivals/movie-on-the-beach-2026",
  title: "Movie on the Beach 2026",
  dateText: "5 September 2026",
  venue: "Triple Tree Beach Resort (Cha-Am)",
  artistCount: 6,
});
assert.ok(
  listing.cards.every((c) => c.url.startsWith("https://www.musicfestival.in.th/en/festivals/") && c.title),
  "у всех карточек канонический адрес и название",
);
assert.ok(
  !listing.cards.some((c) => c.url.endsWith("/en/festivals")),
  "ссылки шапки/футера на сам список карточками не считаются",
);
const bwlCard = listing.cards.find((c) => c.url.endsWith("/big-wild-life-khao-yai"));
assert.equal(bwlCard?.dateText, "16 October 2026");

const lastPage = parseMusicFestivalListing(fixture("musicfestival-past-last.html"));
assert.equal(lastPage.hasMore, false, "последняя страница прошедших");
assert.equal(lastPage.cards.length, 11);

// --- страница фестиваля: простое описание, площадка, тарифы ---

const bwl = parseMusicFestivalPage(
  fixture("musicfestival-festival.html"),
  "https://www.musicfestival.in.th/festivals/big-wild-life-khao-yai",
);
assert.equal(bwl.title, "Big Wild Life Khao Yai");
assert.equal(bwl.sourceUrl, "https://www.musicfestival.in.th/en/festivals/big-wild-life-khao-yai");
assert.deepEqual(bwl.genres, ["thai-rock", "rock"]);
assert.equal(bwl.dateText, "16 October 2026");
assert.deepEqual(bwl.dates, ["2026-10-16"]);
assert.equal(
  bwl.description,
  "Over 11 hours of pure bliss at a world-class venue.\nSpectacular stage, lights, and sound.\nAt Thanarat Km.21, Khao Yai",
  "описание из <p> с переносами",
);
assert.equal(bwl.posterUrl, "https://www.musicfestival.in.th/media/festivals/big-wild-life-khao-yai/thumbnail.jpg");
assert.equal(bwl.lineupCount, 9);
assert.equal(bwl.lineup.length, 9, "весь состав лежит в разметке — «See all» ничего не догружает");
assert.deepEqual(bwl.lineup[0], {
  name: "Loso",
  url: "https://www.musicfestival.in.th/en/artists/loso",
  photoUrl: "https://www.musicfestival.in.th/media/artists/loso.jpg",
  day: null,
  time: null,
});
assert.deepEqual(
  bwl.lineup[1],
  {
    name: "หินเหล็กไฟ",
    url: "https://www.musicfestival.in.th/en/artists/artist-cojfyc",
    photoUrl: null,
    day: null,
    time: null,
  },
  "тайское имя без фото",
);
assert.equal(bwl.lineup.at(-1)?.name, "Full");
assert.equal(bwl.venueName, "Lan Ratchasiha-Ma");
assert.equal(bwl.venueCity, "Pak Chong, Nakhon Ratchasima");
assert.equal(bwl.venueMapsUrl, "https://maps.app.goo.gl/HxztjA6AymDGtg6u5");
assert.equal(bwl.venue, "Lan Ratchasiha-Ma, Pak Chong, Nakhon Ratchasima");
assert.equal(bwl.organizer, null, "блока Organizer на этой странице нет");
assert.equal(bwl.showtimeUrl, null);
assert.deepEqual(
  bwl.showtimeImages,
  [],
  "секции Showtime нет — пустой массив, картинки соседней «Gallery» в него не попадают",
);
assert.deepEqual(
  bwl.tickets.map((t) => [t.name, t.price]),
  [["Pre Early Bird", "690 THB"], ["Early Bird", "990 THB"], ["General", "1,800 THB"]],
);
assert.equal(bwl.ticketPrice, "Pre Early Bird 690 / Early Bird 990 / General 1,800 THB");
assert.deepEqual(bwl.ticketLinks, [
  { label: "Allticket / Counter Service", url: "https://www.allticket.com/event/BIGWILDLIFEKHAOYAI" },
]);

// --- страница фестиваля: HTML-описание, чип Edition, showtime, организатор ---

const gfest = parseMusicFestivalPage(
  fixture("musicfestival-festival-rich.html"),
  "https://www.musicfestival.in.th/en/festivals/gfest-marathon-2026",
);
assert.equal(gfest.title, "GFest Marathon Concert 2026");
assert.deepEqual(gfest.genres, ["Pop", "Rock"], "чип «Edition: 2026» жанром не считается");
assert.deepEqual(gfest.dates, ["2026-08-29", "2026-08-30"]);
assert.ok(gfest.description?.startsWith("G Fest Marathon Concert 2026 — 2 days, 2 festival concerts"));
assert.match(gfest.description!, /POP DAY Saturday 29 August 2026\n8 concerts · 8 artists/, "<br> внутри абзаца — перенос");
assert.match(gfest.description!, /PUN : INSIDE CONCERT\n\n🟠 ROCK DAY/, "абзацы разделены пустой строкой");
assert.equal(gfest.lineupCount, 17, "счётчик в шапке лайнапа");
assert.equal(gfest.lineup.length, 4, "лента лайнапа в фикстуре обрезана до четырёх карточек");
assert.deepEqual(
  gfest.lineup[0],
  {
    name: "Bowkylion",
    url: "https://www.musicfestival.in.th/en/artists/bowkylion",
    photoUrl: "https://www.musicfestival.in.th/media/artists/bowkylion.jpg",
    day: 1,
    time: "18:00-19:00",
  },
  "у фестиваля с расписанием карточка несёт день и слот — имя не путается с ними",
);
assert.ok(gfest.lineup.every((a) => !/^\d{1,2}:\d{2}/.test(a.name) && !/^day/i.test(a.name)));
assert.equal(gfest.showtimeUrl, "https://www.musicfestival.in.th/en/showtime/gfest-marathon-2026");
assert.deepEqual(
  gfest.showtimeImages,
  [
    "https://www.musicfestival.in.th/media/festivals/gfest-marathon-2026/showtime/pop-showtime.jpg",
    "https://www.musicfestival.in.th/media/festivals/gfest-marathon-2026/showtime/rock-showtime-update.jpeg",
    "https://www.musicfestival.in.th/media/festivals/gfest-marathon-2026/showtime/rock-showtime.jpg",
  ],
  "имена файлов афиш произвольные — опора на папку showtime/ и заголовок секции, а не на «showtime-N»",
);
assert.equal(gfest.organizer, "GMM Show");
assert.equal(gfest.venue, "IMPACT Arena, Pak Kret, Nonthaburi");
assert.equal(gfest.tickets[0].name, "Zone A");
assert.equal(gfest.tickets[0].price, "4,000 THB");
assert.deepEqual(
  gfest.ticketLinks,
  [{ label: "Thai Ticket Major", url: null }],
  "у прошедшего фестиваля кнопка продавца отключена: название есть, ссылки нет",
);

// --- страница фестиваля: галерея Showtime среди чужих картинок ---

const monster = parseMusicFestivalPage(
  fixture("musicfestival-festival-showtime.html"),
  "https://www.musicfestival.in.th/en/festivals/monster-music-festival-2026",
);
assert.equal(monster.title, "Monster Music Festival 2026");
assert.deepEqual(monster.dates, ["2026-07-25", "2026-07-26"]);
assert.equal(monster.showtimeUrl, "https://www.musicfestival.in.th/en/showtime/monster-music-festival-2026");
assert.deepEqual(
  monster.showtimeImages,
  [
    "https://www.musicfestival.in.th/media/festivals/monster-music-festival-2026/showtime/showtime-1.jpg",
    "https://www.musicfestival.in.th/media/festivals/monster-music-festival-2026/showtime/showtime-2.jpg",
  ],
  "две афиши секции Showtime, абсолютными адресами и в порядке страницы",
);
// Ловушки — соседние картинки той же страницы: обложка, логотип шапки,
// highlight между описанием и лайнапом, фото артиста из лайнапа,
// картинка секции «Gallery» и галерея прошлых лет «Previous».
for (const trap of ["/cover.jpg", "/logo.png", "/highlight.jpg", "/media/artists/", "/show.jpg", "/previous/"]) {
  assert.ok(
    !monster.showtimeImages.some((u) => u.includes(trap)),
    `чужая картинка ${trap} в галерею Showtime не попала`,
  );
}
assert.equal(
  monster.posterUrl,
  "https://www.musicfestival.in.th/media/festivals/monster-music-festival-2026/thumbnail.jpg",
  "постер по-прежнему из og:image, а не из галереи",
);

// --- страница расписания (/en/showtime/…) ---

// Фикстура — честный фрагмент сетки Monster: обе шапки целиком (два дня
// по четыре сцены) и все восемь колонок; карточки оставлены только в
// четырёх колонках, остальные пустые — как у сцены, где в этот день
// никто не играет.
const showtime = parseMusicFestivalShowtime(
  fixture("musicfestival-showtime.html"),
  "/en/showtime/monster-music-festival-2026",
);
assert.equal(showtime.sourceUrl, "https://www.musicfestival.in.th/en/showtime/monster-music-festival-2026");
assert.deepEqual(showtime.dayLabels, ["25 Jul", "26 Jul"]);
assert.equal(showtime.slots.length, 5, "по карточке на каждую оставленную ссылку артиста");
assert.deepEqual(
  showtime.slots[0],
  {
    dayLabel: "25 Jul",
    dayIndex: 0,
    stage: "Monster Stage",
    artistName: "Tattoo Colour",
    artistUrl: "https://www.musicfestival.in.th/en/artists/tattoo-colour",
    timeText: "15:00-15:45",
  },
  "первая колонка — первый день и своя сцена, время разобрано",
);
assert.deepEqual(
  showtime.slots[2],
  {
    dayLabel: "25 Jul",
    dayIndex: 0,
    stage: "Play Stage",
    artistName: "2Ectasy & Jeffy & Kakagoesbackhome",
    artistUrl: "https://www.musicfestival.in.th/en/artists/2ectasy-jeffy-kakagoesbackhome",
    timeText: null,
  },
  "карточка без времени — timeText null; пустая соседняя колонка сцену не сдвинула",
);
const secondDay = showtime.slots.find((s) => s.artistName === "Tilly Birds");
assert.deepEqual(
  secondDay,
  {
    dayLabel: "26 Jul",
    dayIndex: 1,
    stage: "Monster Stage",
    artistName: "Tilly Birds",
    artistUrl: "https://www.musicfestival.in.th/en/artists/tilly-birds",
    timeText: "14:00-14:45",
  },
  "пятая колонка — уже второй день (подпись дня шире колонки ровно на число своих сцен)",
);
assert.equal(
  showtime.slots.find((s) => s.artistName === "Fool Step")?.stage,
  "Ground Stage",
  "восьмая колонка — последняя сцена второго дня",
);
assert.ok(
  showtime.slots.every((s) => s.dayLabel && s.stage && s.artistName),
  "слот без дня, сцены или имени не возвращается",
);
assert.deepEqual(
  parseMusicFestivalShowtime("<html><body><main><p>no grid</p></main></body></html>", "/en/showtime/x"),
  { sourceUrl: "https://www.musicfestival.in.th/en/showtime/x", dayLabels: [], slots: [] },
  "сетки нет — ничего не выдумываем",
);

// --- страница артиста ---

const loso = parseMusicFestivalArtist(fixture("musicfestival-artist.html"), "/en/artists/loso");
assert.equal(loso.name, "Loso");
assert.equal(loso.sourceUrl, "https://www.musicfestival.in.th/en/artists/loso");
assert.equal(loso.photoUrl, "https://www.musicfestival.in.th/media/artists/loso.jpg");
assert.deepEqual(loso.genres, ["Rock", "Alternative"]);
assert.deepEqual(loso.festivals[0], {
  title: "Big Wild Life Khao Yai",
  url: "https://www.musicfestival.in.th/en/festivals/big-wild-life-khao-yai",
  dateText: "16 October 2026",
  venue: "Lan Ratchasiha-Ma",
});
assert.equal(loso.festivals.length, 2);

console.log(
  `ok: musicFestival (список ${listing.cards.length}, лайнап ${bwl.lineup.length}/${bwl.lineupCount}, ` +
    `тарифов ${bwl.tickets.length}, афиш Showtime ${monster.showtimeImages.length}, ` +
    `слотов расписания ${showtime.slots.length}, артист ${loso.name})`,
);
