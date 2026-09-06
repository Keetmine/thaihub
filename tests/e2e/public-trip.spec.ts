import { test, expect } from "@playwright/test";

// ПУБЛИЧНАЯ поездка открыта без входа (правка владельца 2026-09-06):
// ссылкой делятся с подругами, и половина из них на сайте не
// зарегистрирована. Закрытые поездки при этом остаются закрытыми, а
// события афиши гость видит заглушками — списки событий у нас под
// подпиской.
//
// Спека нарочно гостевая: своей сессии не заводит. Адреса поездок —
// из локальной копии базы, как и `keetmine` в public-profile.spec.ts.
const PUBLIC_TRIP = "/ru/trips/tayland-20-10-06-11-2025-rcmc";
const FRIENDS_TRIP = "/ru/trips/bangkok-oktyabr-xjlj";

test("гостя пускают в публичную поездку, а не на форму входа", async ({ page }) => {
  await page.goto(PUBLIC_TRIP);
  await expect(page).toHaveURL(new RegExp(`${PUBLIC_TRIP.split("/").pop()}$`));
  await expect(page.locator("h1")).toContainText("Тайланд");
});

test("гость видит события заглушками, а не названиями", async ({ page }) => {
  await page.goto(PUBLIC_TRIP);
  // Закрытая карточка рисует дату и серые плашки; настоящих данных
  // события в разметке нет вовсе — раскрывать нечего.
  await expect(page.locator(".event-card-locked").first()).toBeVisible();
  await expect(page.locator(".event-card:not(.event-card-locked)")).toHaveCount(0);
});

test("поездка «для друзей» гостю не открывается", async ({ page }) => {
  await page.goto(FRIENDS_TRIP);
  const html = await page.content();
  // Ни названия, ни плана — страница отдаёт «не найдено» (у неё и
  // заголовка-h1 нет, поэтому проверяем разметку целиком).
  expect(html).not.toContain("Что посетить");
  expect(html).not.toContain("Бангкок");
});

test("поездка не индексируется", async ({ page }) => {
  await page.goto(PUBLIC_TRIP);
  // Личная страница: открыта по ссылке, но в поиске ей не место — как и
  // профилю.
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});
