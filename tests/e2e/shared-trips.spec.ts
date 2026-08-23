import { test, expect, type Page } from "@playwright/test";

// Права совместных поездок и приватность записей — самое опасное
// сломать молча. Демо-данные: Аня (владелец «Бангкок с подругами») и
// Маша (принятая участница), обе с премиумом.

const TRIP = "/trips/bangkok-s-podrugami-5tc0";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  // Демо-набор есть только в дев-базе — в одноразовой БД CI этих
  // пользователей нет. Неудачный вход возвращает на /login с ошибкой:
  // ждём либо уход со страницы, либо текст ошибки (а не таймаут), и в
  // первом случае корректно скипаем тест вместо падения.
  await Promise.race([
    page.waitForURL((u) => !u.pathname.includes("/login")),
    page.getByText("Неверный email или пароль").waitFor(),
  ]);
  test.skip(
    new URL(page.url()).pathname.includes("/login"),
    `демо-пользователя ${email} нет в этой БД — сценарии совместных поездок требуют демо-данных`,
  );
}

test("участник не может править чужое дело без галочки", async ({ page }) => {
  const marker = `Тест-дело Ани ${Date.now()}`;
  await login(page, "anya@myblhub.com", "friends123");
  await page.goto(`${TRIP}?view=todos`);
  await page.fill('input[name="text"]', marker);
  await page.click('form button:has-text("Добавить")');
  await expect(page.getByText(marker)).toBeVisible();

  // Маша видит дело, но без кнопок правки и с выключенным чекбоксом
  await page.context().clearCookies();
  await login(page, "masha-test@myblhub.com", "friends123");
  await page.goto(`${TRIP}?view=todos`);
  const row = page.locator("div.surface", { hasText: marker }).first();
  await expect(row).toBeVisible();
  await expect(row.locator('button[aria-label="Редактировать дело"]')).toHaveCount(0);
  await expect(row.locator('input[type="checkbox"]')).toBeDisabled();

  // уборка — от лица Ани
  await page.context().clearCookies();
  await login(page, "anya@myblhub.com", "friends123");
  await page.goto(`${TRIP}?view=todos`);
  const anyaRow = page.locator("div.surface", { hasText: marker }).first();
  await anyaRow.locator('button[aria-label="Удалить дело"]').click();
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await expect(page.locator("p", { hasText: marker })).toHaveCount(0);
});

test("приватное дело не видно другим участникам", async ({ page }) => {
  const marker = `Секрет ${Date.now()}`;
  await login(page, "anya@myblhub.com", "friends123");
  await page.goto(`${TRIP}?view=todos`);
  await page.fill('input[name="text"]', marker);
  await page.check('form input[name="isPrivate"]');
  await page.click('form button:has-text("Добавить")');
  await expect(page.getByText(marker)).toBeVisible();

  await page.context().clearCookies();
  await login(page, "masha-test@myblhub.com", "friends123");
  await page.goto(`${TRIP}?view=todos`);
  await expect(page.getByText(marker)).toHaveCount(0);

  await page.context().clearCookies();
  await login(page, "anya@myblhub.com", "friends123");
  await page.goto(`${TRIP}?view=todos`);
  const row = page.locator("div.surface", { hasText: marker }).first();
  await row.locator('button[aria-label="Удалить дело"]').click();
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
});

test("отзыв публикуется и виден с оценкой", async ({ page }) => {
  const marker = `Автотест-отзыв ${Date.now()}`;
  await login(page, "masha-test@myblhub.com", "friends123");
  await page.goto("/dramas/an-affair-of-life");
  await page.locator("summary", { hasText: /отзыв/i }).first().click();
  await page.selectOption('select[name="rating"]', "7");
  await page.fill('section textarea[name="text"]', marker);
  await page.locator('button:has-text("Опубликовать"), button:has-text("Сохранить")').first().click();
  // textarea формы держит тот же текст как defaultValue — проверяем абзац
  await expect(page.locator("p", { hasText: marker })).toBeVisible();

  // уборка: раскрываем details напрямую — клик по summary после
  // ревалидации страницы может прийтись на перерендер и «не залипнуть»
  await page
    .locator("details", { has: page.locator('button:has-text("Удалить отзыв")') })
    .first()
    .evaluate((d) => ((d as HTMLDetailsElement).open = true));
  await page.locator('button:has-text("Удалить отзыв")').click();
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await expect(page.getByText(marker)).toHaveCount(0);
});
