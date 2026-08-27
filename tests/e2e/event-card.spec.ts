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
 * Дата в списке повторялась у каждого события одного дня. Заголовков на
 * каждый день нарочно нет (при одном-двух событиях список превращался в
 * лесенку из дат), так что число показывает только первая строка дня.
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

test("дата не повторяется внутри одного дня", async ({ page }) => {
  await page.goto("/events");
  await page.waitForLoadState("networkidle");
  const cards = await page.locator(".event-card").count();
  test.skip(cards === 0, "в афише пусто");
  const dates = await page
    .locator(".event-card-date")
    .evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()));
  const filled = dates.filter(Boolean);
  expect(new Set(filled).size).toBe(filled.length);
  // Место под дату остаётся всегда — иначе постеры разъехались бы.
  const widths = await page
    .locator(".event-card-date")
    .evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().width)))]);
  expect(widths).toHaveLength(1);
});
