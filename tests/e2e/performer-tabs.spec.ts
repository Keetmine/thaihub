import { test, expect } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./auth-state";

test.use({ storageState: ADMIN_STORAGE_STATE });

/**
 * Вкладки формы исполнителя сохраняются порознь.
 *
 * Проверять это обязательно: обновление сносит связи `deleteMany` и
 * создаёт заново из присланного. Пока сохранялось всё разом, это было
 * безобидно; с раздельными кнопками сохранение «Событий» могло бы
 * стереть сериалы, агентства и ссылки, если сервер не разберёт, какой
 * раздел ему прислали.
 */
test("сохранение одной вкладки не трогает остальные", async ({ page }) => {
  // Ждём саму форму, а не тишину в сети: страница правки подгружает
  // каталоги по мере ввода и до networkidle не доходит.
  await page.goto("/admin/performers");
  const href = await page
    .locator('a[href*="/admin/performers/"][href$="/edit"]')
    .first()
    .getAttribute("href");
  test.skip(!href, "в каталоге нет исполнителей");
  await page.goto(href!);
  await page.waitForSelector('input[name="name"]');

  const before = await page.evaluate(() => ({
    dramas: document.querySelectorAll('input[name="dramaIds"]').length,
    events: document.querySelectorAll('input[name="eventIds"]').length,
    links: document.querySelectorAll('input[name="linkUrl"]').length,
    agencies: document.querySelectorAll('input[name="agencyIds"]').length,
    name: (document.querySelector('input[name="name"]') as HTMLInputElement)?.value,
  }));

  // Сохраняем ТОЛЬКО вкладку «События».
  const eventsTab = page.getByRole("button", { name: "События", exact: true });
  test.skip(!(await eventsTab.count()), "нет вкладки «События»");
  await eventsTab.click();
  await page.getByRole("button", { name: "Сохранить события" }).click();
  // Сохранение вкладки НЕ уводит в список — остаёмся на форме, и кнопка
  // возвращается из «Сохранение…».
  await expect(page.getByRole("button", { name: "Сохранить события" })).toBeEnabled({
    timeout: 20_000,
  });
  expect(page.url()).toContain("/edit");

  await page.goto(href!);
  await page.waitForSelector('input[name="name"]');
  const after = await page.evaluate(() => ({
    dramas: document.querySelectorAll('input[name="dramaIds"]').length,
    events: document.querySelectorAll('input[name="eventIds"]').length,
    links: document.querySelectorAll('input[name="linkUrl"]').length,
    agencies: document.querySelectorAll('input[name="agencyIds"]').length,
    name: (document.querySelector('input[name="name"]') as HTMLInputElement)?.value,
  }));

  expect(after).toEqual(before);
});
