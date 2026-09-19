import assert from "node:assert/strict";
import {
  channelIdFromChannelHtml,
  parseChannelHandle,
  parseChannelId,
} from "../../src/lib/youtubeMusic";

// Определение канала по странице хендла (docs/features/youtube-music-import.md).
// Чистая функция, без сети. Запуск:
//
//   npx tsx tests/unit/youtubeChannelId.test.ts

// --- channelIdFromChannelHtml ---

// Ровно тот случай, из-за которого «вроде есть песни, а при импорте всё
// по нулям» (владелец, 2026-09-19, @supergoods4448): ПЕРВЫМ в разметке
// идёт чужой channelId — канал лейбла из ленты, — а свой канал страницы
// назван только каноническим адресом, og:url и externalId.
const supergoods = `
<html><head>
<link rel="canonical" href="https://www.youtube.com/channel/UC5qIRoEV6sNOG2sdAUwY1jQ">
<meta property="og:url" content="https://www.youtube.com/channel/UC5qIRoEV6sNOG2sdAUwY1jQ">
</head><body>
<script>var data = {"channelId":"UCLJbsOlpjUqBkDTHUoK3FRQ","title":"Sundae Records",
"externalId":"UC5qIRoEV6sNOG2sdAUwY1jQ"};</script>
</body></html>`;
assert.equal(
  channelIdFromChannelHtml(supergoods),
  "UC5qIRoEV6sNOG2sdAUwY1jQ",
  "канал страницы, а не первый попавшийся channelId из ленты",
);

// Без канонического адреса и og:url остаётся externalId — он тоже про
// саму страницу, а не про соседей по ленте.
assert.equal(
  channelIdFromChannelHtml(
    `<script>{"channelId":"UCLJbsOlpjUqBkDTHUoK3FRQ","externalId":"UC5qIRoEV6sNOG2sdAUwY1jQ"}</script>`,
  ),
  "UC5qIRoEV6sNOG2sdAUwY1jQ",
  "externalId сильнее channelId",
);

// Разметка сменилась и ничего «своего» не осталось — берём хоть
// что-нибудь, лишь бы импорт не падал совсем.
assert.equal(
  channelIdFromChannelHtml(`<a href="/channel/UCLJbsOlpjUqBkDTHUoK3FRQ">Sundae Records</a>`),
  "UCLJbsOlpjUqBkDTHUoK3FRQ",
  "последняя надежда — любой /channel/ в разметке",
);

assert.equal(channelIdFromChannelHtml("<html>ничего похожего</html>"), null, "нет канала — null");

// --- parseChannelHandle / parseChannelId ---

assert.equal(parseChannelHandle("https://music.youtube.com/@supergoods4448"), "supergoods4448");
assert.equal(parseChannelHandle("@FREEZEDROP"), "FREEZEDROP");
assert.equal(parseChannelHandle("https://music.youtube.com/channel/UC5qIRoEV6sNOG2sdAUwY1jQ"), null);
assert.equal(
  parseChannelId("https://music.youtube.com/channel/UC5qIRoEV6sNOG2sdAUwY1jQ"),
  "UC5qIRoEV6sNOG2sdAUwY1jQ",
);
assert.equal(parseChannelId("https://music.youtube.com/@supergoods4448"), null);

console.log("youtubeChannelId: все проверки прошли");
