import assert from "node:assert/strict";
import {
  parseTicketsEasyCatalog,
  parseTicketsEasySessionDates,
  isPurchasingService,
} from "../../src/lib/ticketsEasy";

// Разбор каталога tickets-easy.com (docs/features/ticket-site-crawl.md).
// Без сети. Запуск:
//
//   npx tsx tests/unit/ticketsEasy.test.ts

// Разметка — с живой страницы 2026-09-22, укорочена до сути.
const CATALOG = `
<div class="tes-grid">
<a href="https://tickets-easy.com/en/module/ticketseasy/event?id=214876"><div class="tes-poster"><img loading="lazy" src="https://img.tixbay.com/poster/852a.jpg" alt="x"></div><div class="tes-card-body"><span class="tes-category-label">Concerts</span><p class="tes-meta">Thailand &middot; 2026-09-26 18:00 HKT</p><h3>2026 N. Flying LIVE &#039;&amp;CON 5: into REM&#039; in Bangkok</h3><p>MCC Hall Lifestore Ngamwongwan</p><strong>HK$ 469.00 from</strong></div></a>
<a href="https://tickets-easy.com/en/module/ticketseasy/event?id=214889"><div class="tes-poster"><img loading="lazy" src="https://img.tixbay.com/poster/0dda.jpg" alt="x"></div><div class="tes-card-body"><span class="tes-category-label">Concerts</span><p class="tes-meta">Thailand &middot; 2026-10-17 16:00 HKT</p><h3>【Purchasing Service】LINGORM &#039;THE WORLD BETWEEN US&#039; CONCERT</h3><p>Impact Arena</p><strong>HK$ 900.00 from</strong></div></a>
<a href="https://tickets-easy.com/en/module/ticketseasy/event?id=210001"><div class="tes-poster"><img loading="lazy" src="https://img.tixbay.com/poster/aaaa.jpg" alt="x"></div><div class="tes-card-body"><span class="tes-category-label">Concerts</span><p class="tes-meta">Japan &middot; 2026-10-20 19:00 HKT</p><h3>SOMEONE in Tokyo</h3><p>Tokyo Dome</p><strong>HK$ 100.00 from</strong></div></a>
</div>`;

const cards = parseTicketsEasyCatalog(CATALOG);

assert.equal(cards.length, 3, "три карточки");

// 1. Всё, ради чего карточка и разбирается.
const first = cards[0];
assert.equal(first.url, "https://tickets-easy.com/en/module/ticketseasy/event?id=214876");
assert.equal(first.title, "2026 N. Flying LIVE '&CON 5: into REM' in Bangkok", "мнемоники раскодированы");
assert.equal(first.venue, "MCC Hall Lifestore Ngamwongwan");
assert.equal(first.country, "Thailand");
assert.equal(first.date, "2026-09-26");
assert.equal(first.claimedTime, "18:00", "время читаем, но в событие не кладём");
assert.equal(first.posterUrl, "https://img.tixbay.com/poster/852a.jpg");
assert.equal(first.category, "Concerts");
assert.equal(first.priceFrom, "HK$ 469.00 from");

// 2. Страна у каждой карточки своя: по ней и отсеиваем чужие.
assert.deepEqual(
  cards.map((c) => c.country),
  ["Thailand", "Thailand", "Japan"],
);

// 3. Услуга выкупа — не событие.
assert.equal(isPurchasingService(cards[1].title), true, "【Purchasing Service】 распознаётся");
assert.equal(isPurchasingService(cards[0].title), false);

// 4. Дни многодневника со страницы события — машинные даты сессий,
//    без повторов и по порядку.
assert.deepEqual(
  parseTicketsEasySessionDates(`
    <div class="session">Sat 17 Oct 2026·16:00<span>2026-10-17 16:00 HKT</span></div>
    <div class="session">Sun 18 Oct 2026·16:00<span>2026-10-18 16:00 HKT</span></div>
    <div class="session">повтор<span>2026-10-17 16:00 HKT</span></div>
  `),
  ["2026-10-17", "2026-10-18"],
);
assert.deepEqual(parseTicketsEasySessionDates("<p>сессий пока нет</p>"), [], "нет сессий — пусто");

console.log("ticketsEasy: все проверки прошли");
