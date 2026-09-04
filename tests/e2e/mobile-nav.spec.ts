import { test, expect } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./auth-state";

/**
 * Мобильная навигация (редизайн 2026-09): шторка с юзер-блоком и
 * группами, нижний таб-бар, отсутствие горизонтального перелива.
 *
 * Всё на 390px — брейкпоинт шторки/таб-бара < 992px (docs/design-system.md,
 * «Навигация: брейкпоинты»).
 */

const VIEWPORT = { width: 390, height: 844 };

test.describe("шторка гостя", () => {
  test.use({ viewport: VIEWPORT });

  test("открывается бургером, зовёт войти, закрывается по Esc", async ({ page }) => {
    await page.goto("/");
    await page.locator(".burger-btn").click();

    const drawer = page.locator(".mobile-drawer");
    await expect(drawer).toBeVisible();
    // Гостю профиль не нужен — наверху кнопка входа.
    await expect(drawer.locator(".drawer-signin")).toHaveText("Sign in");
    // Каталог собран под подзаголовком, а не плоским списком.
    await expect(drawer.locator(".drawer-group-label").first()).toHaveText("Catalogue");
    // Личной группы у гостя нет.
    await expect(drawer.locator(".mobile-profile")).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
  });

  test("клик по подложке закрывает шторку", async ({ page }) => {
    await page.goto("/");
    await page.locator(".burger-btn").click();
    await expect(page.locator(".mobile-drawer")).toBeVisible();
    await page.locator(".mobile-drawer-backdrop").click({ position: { x: 10, y: 300 } });
    await expect(page.locator(".mobile-drawer")).toHaveCount(0);
  });
});

test.describe("шторка залогиненного", () => {
  test.use({ storageState: ADMIN_STORAGE_STATE, viewport: VIEWPORT });

  test("юзер-блок ведёт на свой профиль, группы на месте, навигация закрывает", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator(".burger-btn").click();

    const drawer = page.locator(".mobile-drawer");
    await expect(drawer).toBeVisible();
    // Юзер-блок наверху — ссылка на объединённый профиль /users/…
    const head = drawer.locator(".mobile-profile-head-link");
    await expect(head).toBeVisible();
    expect(await head.getAttribute("href")).toMatch(/\/users\//);
    // Группы: каталог и личное, с подзаголовками.
    await expect(drawer.locator(".drawer-group-label")).toHaveText(["Catalogue", "Personal"]);
    // «Поездки» в личной группе несут метку тура — шаг ходит по ней.
    await expect(drawer.locator("[data-tour='trips']")).toHaveCount(1);

    // Тап по юзер-блоку: уходим на профиль, шторка закрывается сама.
    await head.click();
    await page.waitForURL(/\/users\//);
    await expect(page.locator(".mobile-drawer")).toHaveCount(0);
  });
});

test.describe("таб-бар и переливы", () => {
  test.use({ viewport: VIEWPORT });

  test("таб-бар подсвечивает раздел и не даёт горизонтального скролла", async ({ page }) => {
    await page.goto("/events");
    const tabbar = page.locator(".mobile-tabbar");
    await expect(tabbar).toBeVisible();
    await expect(tabbar.locator(".mobile-tab.active")).toHaveText("Events");

    // Пять кнопок, каждая — честный тап-таргет (≥44px высотой).
    const tabs = tabbar.locator(".mobile-tab");
    await expect(tabs).toHaveCount(5);
    for (const tab of await tabs.all()) {
      const box = await tab.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }

    for (const url of ["/", "/events", "/search"]) {
      await page.goto(url);
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width, `горизонтальный перелив на ${url}`).toBe(VIEWPORT.width);
    }
  });
});
