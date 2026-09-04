import { test, expect } from "@playwright/test";

// Компактный каталог /dramas (2026-09-04): строка ~50px вместо ~100px,
// на мобиле вместо вертикальной рейки — горизонтальная липкая полоска
// букв над списком. Всё гостевое — без входа (лимит логинов душит
// повторные прогоны, а список гостя рендерит те же строки).

test("строка каталога компактная, буквы рейки — настоящие ссылки ?letter=", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dramas");

  const firstRow = page.locator(".performers-list .surface").first();
  await expect(firstRow).toBeVisible();
  const box = await firstRow.boundingBox();
  // Прежняя «карточка» была ~100px; компактная строка держится под 60.
  expect(box!.height).toBeLessThan(60);

  // С-5: краулабельные буквы — href остаётся серверной страницей буквы.
  const letterLink = page.locator('.performers-index a[href^="/dramas?letter="]').first();
  await expect(letterLink).toBeVisible();

  // Клик живого зрителя — скролл по якорю, БЕЗ навигации на ?letter=.
  await letterLink.click();
  await expect(page).toHaveURL(/\/dramas$/);
});

test("на мобиле рейка — горизонтальная полоска над списком", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dramas");

  const rail = page.locator(".performers-index");
  const firstSection = page.locator(".performers-letter-section").first();
  await expect(rail).toBeVisible();
  await expect(firstSection).toBeVisible();

  const railBox = (await rail.boundingBox())!;
  const sectionBox = (await firstSection.boundingBox())!;
  // Полоска лежит НАД первой буквой списка и вытянута по горизонтали.
  expect(railBox.y).toBeLessThan(sectionBox.y);
  expect(railBox.width).toBeGreaterThan(railBox.height);
  // И не съедает ширину строк: строка занимает почти весь вьюпорт.
  const rowBox = (await page.locator(".performers-list .surface").first().boundingBox())!;
  expect(rowBox.width).toBeGreaterThan(340);
});

test("серверная страница буквы отдаёт полный список ссылками", async ({ page }) => {
  await page.goto("/dramas?letter=K");
  // Ссылка назад на полный каталог + список записей буквы.
  await expect(page.locator('a[href$="/dramas"]').first()).toBeVisible();
  const links = page.locator('ul a[href*="/dramas/"]');
  expect(await links.count()).toBeGreaterThan(0);
});
