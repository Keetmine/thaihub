import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test("admin can log in and reach the dashboard", async ({ page }) => {
  await loginAsAdmin(page);
  await expect(page.getByRole("heading", { name: "Дашборд" })).toBeVisible();
});
