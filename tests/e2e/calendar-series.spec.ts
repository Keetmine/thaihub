import { execFileSync } from "node:child_process";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./auth-state";
import { TODAY_DRAMA } from "./testSmokeFixtures";

/**
 * Смоук вокруг календаря серий (Ж9/И9).
 *
 * 1. /calendar — закрытый раздел: гостя без куки сессии proxy.ts уводит
 *    на /login ещё до пейволла (премиум-заглушку для ВОШЕДШЕГО без
 *    подписки проверяет premium-gates.spec.ts). Редирект — контракт:
 *    сломается он — календарь откроется анониму.
 * 2. Блок «Выходит сегодня» — он в залогиненном дашборде (гость на «/»
 *    видит LandingPage), поэтому тест берёт админскую сессию из
 *    setup-проекта; дополнительного входа это не стоит. Серия-фикстура
 *    с сегодняшней датой (create-smoke-fixtures.ts) обязана попасть в
 *    блок с номером серии на чипе.
 */
const fixtureScript = (name: string) =>
  execFileSync("npx", ["tsx", path.join(__dirname, name)], {
    cwd: path.join(__dirname, "../.."),
  });

test.beforeAll(() => fixtureScript("create-smoke-fixtures.ts"));
test.afterAll(() => fixtureScript("delete-smoke-fixtures.ts"));

test("гость на /calendar уводится на /login", async ({ page }) => {
  await page.goto("/calendar", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/login/);
  // Это действительно форма входа, а не пейволл и не данные календаря.
  await expect(page.locator('input[type="password"]').first()).toBeVisible();
});

test.describe("«Выходит сегодня» на главной", () => {
  test.use({ storageState: ADMIN_STORAGE_STATE });

  test("сегодняшняя серия попадает в блок с номером на чипе", async ({ page }) => {
    // Выборка «выходит сегодня» кэшируется на полчаса (unstable_cache с
    // CATALOG_TAG на главной), а фикстуры пишутся в базу напрямую, мимо
    // кэша. Сохранение записи в админке зовёт logAudit →
    // invalidateCatalogCache — сбрасываем тег ровно тем же путём, каким
    // это делает живая правка каталога.
    await page.goto(`/admin/dramas?q=${encodeURIComponent(TODAY_DRAMA.title)}`);
    await page.getByRole("link", { name: TODAY_DRAMA.title }).first().click();
    await page.waitForSelector('input[name="title"]');
    await page.getByRole("button", { name: /Сохранить/ }).first().click();
    await expect(page.getByText("Сохранено")).toBeVisible({ timeout: 15000 });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    // Сессия setup-проекта несёт locale=en, но спека устойчива к обоим
    // языкам, как соседние.
    const heading = page.getByRole("heading", { name: /Airing today|Выходит сегодня/ });
    await expect(heading).toBeVisible();

    const section = heading.locator("xpath=ancestor::section[1]");
    const row = section.locator("a", { hasText: TODAY_DRAMA.title });
    await expect(row).toBeVisible();
    // Чип с номером серии — то, ради чего блок существует.
    const n = TODAY_DRAMA.episodeNumber;
    await expect(row.getByText(new RegExp(`Episode ${n}|${n} серия`))).toBeVisible();
    // Из блока есть выход в календарь серий (И9).
    await expect(section.locator('a[href*="/calendar?view=series"]')).toHaveCount(1);
  });
});
