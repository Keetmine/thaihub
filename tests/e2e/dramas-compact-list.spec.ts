import { test, expect } from "@playwright/test";

// Каталог /dramas — компактная ТАБЛИЦА: строка ~50px вместо прежней
// ~100px «карточки», над строками шапка с названиями колонок, и она же
// сортирует. Букв больше нет вовсе (правка владельца 2026-09-06): ни
// литеры в левом жёлобе, ни рейки справа — порядок задаёт шапка.
// Серверные страницы буквы (?letter=X) при этом живы: они нужны
// краулеру. Всё гостевое — без входа (лимит логинов душит повторные
// прогоны, а список гостя рендерит те же строки).

test("строка компактная, букв и рейки нет", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dramas");

  const firstRow = page.locator(".surface-hover").first();
  await expect(firstRow).toBeVisible();
  const box = await firstRow.boundingBox();
  // Прежняя «карточка» была ~100px; компактная строка держится под 60.
  expect(box!.height).toBeLessThan(60);

  // Ни жёлоба с буквой, ни вертикальной рейки.
  await expect(page.locator(".performers-letter-heading")).toHaveCount(0);
  await expect(page.locator(".performers-index")).toHaveCount(0);
});

test("шапка таблицы сортирует и возвращает исходный порядок", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dramas");

  const head = page.locator('[class*="headCell"]');
  // Шесть колонок: название, статус, тип, год, страна, серии.
  expect(await head.count()).toBe(6);

  const titlesNow = async () =>
    (await page.locator('[class*="titleWrap"]').allInnerTexts()).slice(0, 3).join("|");
  const before = await titlesNow();

  // Первый клик — по возрастанию, адрес несёт состояние сортировки.
  const yearHead = page.getByRole("link", { name: /Год|Year/ }).first();
  await yearHead.click();
  await expect(page).toHaveURL(/sort=year/);
  await expect(page).not.toHaveURL(/dir=desc/);

  // Второй — по убыванию.
  await page.getByRole("link", { name: /Год|Year/ }).first().click();
  await expect(page).toHaveURL(/dir=desc/);

  // Третий — сортировки нет, и порядок тот же, что был вначале.
  await page.getByRole("link", { name: /Год|Year/ }).first().click();
  await expect(page).not.toHaveURL(/sort=/);
  expect(await titlesNow()).toBe(before);
});

test("сортировка не теряет поиск", async ({ page }) => {
  await page.goto("/dramas?q=love");
  await page.getByRole("link", { name: /Год|Year/ }).first().click();
  await expect(page).toHaveURL(/q=love/);
  await expect(page).toHaveURL(/sort=year/);
});

test("серверная страница буквы отдаёт полный список ссылками", async ({ page }) => {
  await page.goto("/dramas?letter=K");
  // Ссылка назад на полный каталог + список записей буквы.
  await expect(page.locator('a[href$="/dramas"]').first()).toBeVisible();
  const links = page.locator('ul a[href*="/dramas/"]');
  expect(await links.count()).toBeGreaterThan(0);
});
