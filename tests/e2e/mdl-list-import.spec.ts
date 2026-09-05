import { test, expect } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./auth-state";

// Импорт списка просмотра с MyDramaList — блок в настройках аккаунта
// (вкладка «Import»). Здесь только UI и валидация ввода: живой прогон
// ходит на чужой сайт десятком запросов и упирается в наш же лимит
// «раз в 10 минут», в регулярном e2e-наборе ему не место. Сам разбор
// страницы покрыт юнитами (tests/unit/mdlListImport.test.ts), живой
// сквозной прогон на списке keetmine выполнен при разработке.
test.use({ storageState: ADMIN_STORAGE_STATE });

test("settings has the MDL import block and rejects bad input", async ({ page }) => {
  await page.goto("/account/settings");

  // Вкладка «Import» — пятая в настройках.
  await page.click('.tab-bar-item:has-text("Import")');
  await expect(page.getByText("Import from MyDramaList")).toBeVisible();

  // Чужой хост — не список MDL: ошибка валидации, никакой сети.
  await page.fill("#mdl-import-input", "https://evil.com/dramalist/x");
  await page.click('form:has(#mdl-import-input) button[type="submit"]');
  await expect(page.getByText("Paste a link to your list")).toBeVisible();

  // Кириллица тоже мимо: ник в адресе только латиницей.
  await page.fill("#mdl-import-input", "ник со пробелами");
  await page.click('form:has(#mdl-import-input) button[type="submit"]');
  await expect(page.getByText("Paste a link to your list")).toBeVisible();
});
