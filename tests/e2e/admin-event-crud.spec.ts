import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test("admin can create and delete an event", async ({ page }) => {
  const title = `Smoke Test Event ${Date.now()}`;

  await loginAsAdmin(page);
  await page.goto("/admin/events/new");

  await page.fill('input[name="title"]', title);
  await page.fill('input[name="venue"]', "Test Venue");
  // Дата выбирается через кастомный DatePickerInput (нативного
  // input type=date больше нет): открыть календарь, переключиться на
  // СЛЕДУЮЩИЙ месяц (15-е текущего может быть уже в прошлом — событие
  // улетело бы во вкладку «Архив») и кликнуть 15-е.
  await page.locator(".date-picker .date-picker-toggle").first().click();
  const monthSelect = page.locator(".date-picker-dropdown select").first();
  const next = new Date();
  next.setDate(1);
  next.setMonth(next.getMonth() + 1);
  const yearSelect = page.locator(".date-picker-dropdown select").nth(1);
  await yearSelect.selectOption(String(next.getFullYear()));
  await monthSelect.selectOption(String(next.getMonth()));
  await page
    .locator(".date-picker-dropdown .date-picker-day:not(.is-outside)")
    .filter({ hasText: /^15$/ })
    .click();
  await page.fill('input[name="occurrenceStartTime"]', "19:00");
  await page.getByRole("button", { name: "Создать событие" }).click();

  await page.waitForURL(/\/admin\/events$/);
  await expect(page.getByText(title)).toBeVisible();

  // Clean up — open the event's edit page and delete it via the
  // ConfirmForm modal (a custom in-app dialog, not a native confirm()).
  await page.getByText(title).click();
  // Клик может прийтись до гидрации (React ещё не навесил onClick на
  // триггер ConfirmForm) — кликаем с ретраем, пока модалка не откроется.
  await expect(async () => {
    await page.getByRole("button", { name: "Удалить событие" }).click();
    await expect(
      page.getByRole("button", { name: "Удалить", exact: true }),
    ).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await page.waitForURL(/\/admin\/events$/);
  await expect(page.getByText(title)).not.toBeVisible();
});
