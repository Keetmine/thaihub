import { test, expect } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./auth-state";

/**
 * Каждая подпись поля должна вести к своему полю.
 *
 * Проверять это глазами нельзя: подпись выглядит одинаково и когда она
 * связана, и когда нет, — а для того, кто читает экраном, во втором
 * случае поля просто безымянные. Раньше во всём проекте связанных не
 * было ни одной.
 *
 * Ловим три беды сразу: подпись без ссылки; ссылку в никуда (поле
 * рисуется по условию, а подпись стоит всегда); и один id на несколько
 * полей — так бывает, когда компонент с формой рисуется в списке по
 * многу раз, и лечится useId.
 */
test.use({ storageState: ADMIN_STORAGE_STATE });

const PAGES = [
  "/account/settings", "/welcome/profile", "/trips", "/lists", "/artist-lists",
  "/admin/schedule", "/admin/performers", "/admin/imports",
  "/admin/dramas/new", "/admin/performers/new", "/admin/events/new",
  "/admin/novels/new", "/admin/locations/new", "/admin/agencies/new",
  "/admin/wiki/new", "/admin/achievements/new", "/admin/settings",
  "/admin/broadcast", "/admin/imports/ttm",
];

for (const path of PAGES) {
  test(`подписи связаны: ${path}`, async ({ page }) => {
    const res = await page.goto(path);
    if (!res || res.status() >= 400) test.skip(true, `нет страницы ${path}`);
    const bad = await page.evaluate(() => {
      const labels = [...document.querySelectorAll("label.form-label")];
      const problems: string[] = [];
      for (const l of labels) {
        const text = (l.textContent ?? "").trim().slice(0, 30);
        const forId = l.getAttribute("for");
        if (forId) {
          const targets = document.querySelectorAll(`#${CSS.escape(forId)}`);
          if (targets.length === 0) problems.push(`«${text}» → нет поля #${forId}`);
          else if (targets.length > 1) problems.push(`«${text}» → id #${forId} не один`);
        } else if (!l.id) {
          problems.push(`«${text}» → без for и без id`);
        }
      }
      return problems;
    });
    expect(bad, bad.join("\n")).toEqual([]);
  });
}
