import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

// Единственная админская спека без сохранённого состояния прогона:
// она про сам вход. Залогиненного форма входа увела бы сразу в кабинет.

test("admin can log in and reach the dashboard", async ({ page }) => {
  await loginAsAdmin(page);
  await expect(page.getByRole("heading", { name: "Дашборд" })).toBeVisible();
});
