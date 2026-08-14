import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test("admin can create and delete an event", async ({ page }) => {
  const title = `Smoke Test Event ${Date.now()}`;

  await loginAsAdmin(page);
  await page.goto("/admin/events/new");

  await page.fill('input[name="title"]', title);
  await page.fill('input[name="venue"]', "Test Venue");
  await page.fill('input[name="occurrenceDate"]', "2027-01-15");
  await page.fill('input[name="occurrenceStartTime"]', "19:00");
  await page.getByRole("button", { name: "Создать событие" }).click();

  await page.waitForURL(/\/admin$/);
  await expect(page.getByText(title)).toBeVisible();

  // Clean up — open the event's edit page and delete it via the
  // ConfirmForm modal (a custom in-app dialog, not a native confirm()).
  await page.getByText(title).click();
  await page.getByRole("button", { name: "Удалить событие" }).click();
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await page.waitForURL(/\/admin$/);
  await expect(page.getByText(title)).not.toBeVisible();
});
