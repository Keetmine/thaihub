import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * Дыра, пойманная владельцем 2026-09-05: гость искал имя артиста и
 * получал всю его афишу — поиск был единственным открытым СПИСКОМ
 * событий и легально обходил подписку. Спек прибивает контракт:
 * названия событий не попадают в разметку поиска ни на странице
 * выдачи, ни в секции «События»; вместо них — запертые карточки.
 * Карточка события по прямой ссылке остаётся публичной — это другое
 * решение (SEO), спек его не трогает.
 */

const fixtureScript = (name: string) =>
  execFileSync("npx", ["tsx", path.join(__dirname, name)], {
    cwd: path.join(__dirname, "../.."),
  });

// Фикстурное событие «E2E Photo Event» заводит create-audit-fixtures —
// тот же набор, что у спека фото событий.
const EVENT_TITLE = "E2E Photo Event";
// Канарейка утечки — ПЛОЩАДКА, а не название: название гость сам ввёл
// в запрос, и страница честно эхает его в заголовке и поле поиска.
// Площадку он не вводил — в HTML она может попасть только из данных
// события.
const EVENT_VENUE = "E2E Photo Venue";

test.beforeAll(() => fixtureScript("create-audit-fixtures.ts"));
test.afterAll(() => fixtureScript("delete-audit-fixtures.ts"));

test("гость не видит названий событий в поиске", async ({ page }) => {
  await page.goto(`/search?q=${encodeURIComponent(EVENT_TITLE)}`, {
    waitUntil: "domcontentloaded",
  });
  // Данные события не должны попасть в HTML вовсе — маскирование
  // серверное: ни площадки, ни ссылки на карточку события.
  const html = await page.content();
  expect(html).not.toContain(EVENT_VENUE);
  expect(html).not.toMatch(/href="[^"]*\/event\//);
  // Вместо строки — запертая карточка с датой.
  await expect(page.locator(".event-card-locked").first()).toBeVisible();

  // Секция «События» отдельно — тот же контракт.
  await page.goto(
    `/search?q=${encodeURIComponent(EVENT_TITLE)}&section=events`,
    { waitUntil: "domcontentloaded" },
  );
  const sectionHtml = await page.content();
  expect(sectionHtml).not.toContain(EVENT_VENUE);
  expect(sectionHtml).not.toMatch(/href="[^"]*\/event\//);
});
