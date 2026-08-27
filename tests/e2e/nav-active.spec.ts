import { test, expect } from "@playwright/test";

/**
 * Подсветка активного раздела в шапке и футере.
 *
 * Две вещи, которые ломались молча и по-разному.
 *
 * Русская версия живёт под /ru (рерайт в proxy), а href приходит в
 * NavLink без префикса — его подставляет AppLink. Пока сравнивали как
 * есть, на русском не совпадало НИЧЕГО: «/ru/dramas» против
 * «/dramas», — и подсветки там не было вовсе.
 *
 * Футер сравнивал только точный адрес: на карточке сериала «Сериалы»
 * горели в шапке и молчали в футере. Префиксы у обоих теперь общие
 * (NAV_PREFIXES).
 */
const ACTIVE_HEAD = ".pill-nav .nav-link.active";
const ACTIVE_FOOT = ".footer-link.active";

for (const prefix of ["", "/ru"]) {
  const lang = prefix === "" ? "английской" : "русской";

  test(`раздел каталога подсвечен на ${lang} версии`, async ({ page }) => {
    await page.goto(`${prefix}/dramas`);
    await expect(page.locator(ACTIVE_HEAD)).toHaveCount(1);
    await expect(page.locator(ACTIVE_FOOT)).toHaveCount(1);
    // Именно оранжевым, а не приглушённым оттенком.
    const color = await page.locator(ACTIVE_HEAD).evaluate((e) => getComputedStyle(e).color);
    expect(color).toBe("rgb(255, 106, 61)");
  });

  test(`карточка держит подсветку раздела на ${lang} версии`, async ({ page }) => {
    await page.goto(`${prefix}/dramas`);
    const href = await page.locator('a[href*="/dramas/"]').first().getAttribute("href");
    test.skip(!href, "в каталоге нет сериалов");
    await page.goto(href!);
    // И в шапке, и в футере: на карточке футер раньше молчал.
    await expect(page.locator(ACTIVE_HEAD)).toHaveCount(1);
    await expect(page.locator(ACTIVE_FOOT)).toHaveCount(1);
  });
}
