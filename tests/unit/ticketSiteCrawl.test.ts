import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { allticketCardsToUrls, canonicalTicketmelonUrl, isPastStart, parseTicketmelonSitemap } from "../../src/lib/ticketSiteCrawl";
import { parseTicketmelonEventMeta, parseTicketmelonHtml, parseAllticketInfo } from "../../src/lib/eventTicketSites";

// Краулеры Ticketmelon и AllTicket (docs/features/ticket-site-crawl.md):
// чистые части — карта сайта, канонизация адресов, карточки раздела,
// мета страницы события — на сохранённых фрагментах (2026-09-18). Без
// сети и БД. Запуск:
//
//   npx tsx tests/unit/ticketSiteCrawl.test.ts

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

// --- адреса Ticketmelon ---
assert.equal(canonicalTicketmelonUrl("https://www.ticketmelon.com/meltlivehouse/meltfestival?x=1#t"), "https://www.ticketmelon.com/meltlivehouse/meltfestival");
assert.equal(canonicalTicketmelonUrl("https://www.ticketmelon.com/th/meltlivehouse/meltfestival"), "https://www.ticketmelon.com/meltlivehouse/meltfestival", "языковой префикс срезается");
assert.equal(canonicalTicketmelonUrl("https://ticketmelon.com/eo/ev/"), "https://www.ticketmelon.com/eo/ev", "www добавляется, хвостовой слеш срезается");
assert.equal(canonicalTicketmelonUrl("https://www.ticketmelon.com/wonderfruit"), null, "один сегмент — организатор, не событие");
assert.equal(canonicalTicketmelonUrl("https://www.ticketmelon.com/user/orders"), null);
assert.equal(canonicalTicketmelonUrl("https://www.thaiticketmajor.com/concert/x.html"), null);

// --- карта сайта ---
const urls = parseTicketmelonSitemap(fixture("ticketmelon-sitemap.xml"));
assert.equal(urls.length, 6, "шесть событий: организатор и дубль с query выпали");
assert.equal(urls[0], "https://www.ticketmelon.com/panospotlight/TNPBerlinFM");
assert.ok(!urls.includes("https://www.ticketmelon.com/wonderfruit"));

// --- прошедшее ---
const now = Date.parse("2026-09-18T12:00:00Z");
assert.equal(isPastStart(Date.parse("2026-09-16T12:00:00Z"), now), true);
assert.equal(isPastStart(Date.parse("2026-09-17T18:00:00Z"), now), false, "сутки запаса — вчерашний вечер ещё не прошедшее");
assert.equal(isPastStart(null, now), false, "без даты — не прошедшее");

// --- страница события Ticketmelon: TtmEvent + мета ---
const html = fixture("ticketmelon-event.html");
const ev = parseTicketmelonHtml(html, "https://www.ticketmelon.com/meltlivehouse/meltfestival");
assert.equal(ev.title, "MELT FESTIVAL");
assert.equal(ev.date, "2026-11-21", "show_starttime → бангкокская дата");
assert.ok(ev.description?.includes("Phum Viphurit"), "описание — текст, в нём лайнап");
const meta = parseTicketmelonEventMeta(html);
assert.deepEqual(meta?.categories, ["Music"]);
assert.equal(meta?.status, "publish");
assert.equal(meta?.isActive, true);
assert.equal(meta?.showStartMs, 1795244400000);
assert.equal(meta?.eoSlug, "meltlivehouse");
assert.equal(parseTicketmelonEventMeta("<html>no data</html>"), null);

// --- карточки AllTicket ---
const concert = JSON.parse(fixture("allticket-concert.json")) as { data: { item: Parameters<typeof allticketCardsToUrls>[0] } };
const cards = allticketCardsToUrls(concert.data.item);
assert.equal(cards.length, 4, "купон (PACKAGE) и справка (INFO) — не события");
assert.ok(cards.every((c) => c.url.startsWith("https://www.allticket.com/event/")));
assert.ok(cards.every((c) => c.title.length > 0));
assert.equal(allticketCardsToUrls([{ performUri: "A" }, { performUri: "A" }]).length, 1, "дубли по коду сворачиваются");

// --- master-файл AllTicket → TtmEvent (прошедшее по датам) ---
const past = parseAllticketInfo({ event_full_name: "X", event_show_date: "5, 19 SEPTEBER 2026", event_show_time: "19:00" }, "https://www.allticket.com/event/X");
assert.deepEqual([past.date, ...past.extraDates], ["2026-09-05", "2026-09-19"]);
assert.equal(past.startTime, "19:00");

console.log("ticketSiteCrawl: ok");
