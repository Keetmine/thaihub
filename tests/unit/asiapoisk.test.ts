import assert from "node:assert/strict";
import {
  hasCyrillic,
  matchKey,
  normalizeCountry,
  parseAsiapoiskPage,
  parseAsiapoiskSitemap,
  parseSitemapIndex,
  sitemapKeys,
} from "../../src/lib/asiapoisk";

// Разбор карточек asiapoisk.com (docs/features/asiapoisk-import.md).
// Заголовки взяты с живых страниц. Запуск:
//
//   npx tsx tests/unit/asiapoisk.test.ts

const page = (title: string) =>
  parseAsiapoiskPage(`<html><head><title>${title}</title></head></html>`, "https://asiapoisk.com/doramas/x");

// Обычная карточка: русское, английское и оригинальное названия, страна
// и год.
const simple = page(
  "Дорама Магазин для убийц Сезон 2 / A Shop for Killers Season 2 / 킬러들의 쇼핑몰 시즌2 (Южная Корея, 2026) - Азияпоиск",
);
assert.equal(simple.titleRu, "Магазин для убийц Сезон 2");
assert.deepEqual(simple.altTitles, ["A Shop for Killers Season 2", "킬러들의 쇼핑몰 시즌2"]);
assert.equal(simple.countryRu, "Южная Корея");
assert.deepEqual(simple.years, [2026]);

// У многосезонных в скобках два года — оба наши.
const twoYears = page("Дорама Море алчности / Talay Rissaya / ทะเลริษยา (Таиланд, 2006, 2007) - Азияпоиск");
assert.deepEqual(twoYears.years, [2006, 2007], "берём оба года");
assert.equal(twoYears.countryRu, "Таиланд");

// «Русское» название бывает продублированной латиницей — это НЕ
// перевод, и синк такое не записывает.
const noRu = page("Дорама Seua Chanee Gayng: Freshy / Seua Chanee Gayng (Таиланд, 2018) - Азияпоиск");
assert.equal(noRu.titleRu, null, "латиница переводом не считается");
assert.ok(!hasCyrillic("Seua Chanee Gayng"));
assert.ok(hasCyrillic("Море алчности"));

// Сущности в заголовке не должны утечь в название.
const entities = page("Дорама Отель &quot;Дель Луна&quot; / Hotel Del Luna (Южная Корея, 2019) - Азияпоиск");
assert.equal(entities.titleRu, 'Отель "Дель Луна"');

// Страны переводятся в наши английские; незнакомая — null, чтобы не
// записать в каталог отсебятину.
assert.equal(normalizeCountry("Таиланд"), "Thailand");
assert.equal(normalizeCountry("Южная Корея"), "South Korea");
assert.equal(normalizeCountry("Марс"), null);

// Ключи сведения: слаг с годом и без — наш год лежит отдельным полем.
assert.deepEqual(sitemapKeys("https://asiapoisk.com/doramas/Talay_Rissaya_2006"), [
  "talay rissaya 2006",
  "talay rissaya",
]);
assert.deepEqual(sitemapKeys("https://asiapoisk.com/doramas/Pisces"), ["pisces"]);
assert.equal(matchKey("The Queen!"), "the queen");

// Из карты сайта берём только карточки: служебные подстраницы и
// запрещённые robots.txt разделы отсеиваются.
const sitemap = parseAsiapoiskSitemap(`
  <urlset>
    <url><loc>https://asiapoisk.com/doramas/My_Engineer_2020</loc></url>
    <url><loc>https://asiapoisk.com/doramas/My_Engineer_2020/actors</loc></url>
    <url><loc>https://asiapoisk.com/doramas/filter/country-tailand</loc></url>
    <url><loc>https://asiapoisk.com/doramas/alphabetical</loc></url>
    <url><loc>https://asiapoisk.com/movies/Some_Movie</loc></url>
  </urlset>`);
assert.deepEqual(sitemap, ["https://asiapoisk.com/doramas/My_Engineer_2020"]);

assert.deepEqual(
  parseSitemapIndex(
    "<sitemapindex><sitemap><loc>https://asiapoisk.com/sitemap1.xml</loc></sitemap></sitemapindex>",
  ),
  ["https://asiapoisk.com/sitemap1.xml"],
);

console.log("ok: разбор карточек asiapoisk");
