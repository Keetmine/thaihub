import { test, expect } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./auth-state";

test.use({ storageState: ADMIN_STORAGE_STATE });

/**
 * Строка афиши: две вещи, которые ломались молча.
 *
 * Пропавший постер оставлял пустую рамку — буквенный фолбэк срабатывал,
 * только когда постера не было в базе вовсе. Одного onError мало:
 * разметка приходит с сервера, и ошибка загрузки успевает случиться
 * раньше гидратации, поэтому карточка ещё и спрашивает саму картинку
 * при монтировании.
 *
 * Дата стоит у КАЖДОЙ строки, включая соседние события одного дня.
 * Одно время её у повторов прятали, но так теряется главное: по афише
 * ведут глазами вниз и смотрят на число, а не считают, к какой строке
 * выше оно относится.
 */
test("пропавший постер уступает место букве", async ({ page }) => {
  await page.route("**/uploads/**", (r) => r.fulfill({ status: 404 }));
  await page.goto("/events");
  await page.waitForLoadState("networkidle");
  const cards = await page.locator(".event-card").count();
  test.skip(cards === 0, "в афише пусто");
  await expect(page.locator(".event-card-poster-fallback")).toHaveCount(cards);
  // Геометрия не должна поехать: рамка постера одна и та же у всех.
  const heights = await page
    .locator(".event-card-poster")
    .evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().height)))]);
  expect(heights).toHaveLength(1);
});

test("дата стоит у каждой строки", async ({ page }) => {
  await page.goto("/events");
  await page.waitForLoadState("networkidle");
  const cards = await page.locator(".event-card").count();
  test.skip(cards === 0, "в афише пусто");
  const dates = await page
    .locator(".event-card-date")
    .evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()));
  expect(dates).toHaveLength(cards);
  expect(dates.filter(Boolean)).toHaveLength(cards);
});
