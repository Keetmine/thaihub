import { test, expect } from "@playwright/test";
import { signupTestUser } from "./helpers";

// Самоудаление аккаунта (roadmap Э1.7): свежий пользователь удаляет
// себя из настроек — сессия рвётся, повторный вход по тем же данным
// невозможен (почта обезличена).
test("пользователь может удалить свой аккаунт из настроек", async ({ page }) => {
  const email = `smoke-delete-${Date.now()}@example.com`;
  const password = "test-password-123";
  await signupTestUser(page, email, password);

  await page.goto("/account/settings");
  await page.getByRole("button", { name: "Безопасность" }).click();

  // Клик может прийтись до гидрации — ретраим, пока модалка ConfirmForm
  // не откроется (тот же паттерн, что в admin-event-crud.spec.ts).
  await expect(async () => {
    await page.getByRole("button", { name: "Удалить аккаунт" }).click();
    await expect(
      page.getByRole("button", { name: "Удалить навсегда" }),
    ).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
  await page.getByRole("button", { name: "Удалить навсегда" }).click();
  await page.waitForURL(/\/$|\/about/);

  // Старые данные больше не подходят: почта освобождена.
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await expect(page.getByText("Неверный email или пароль")).toBeVisible();
});
