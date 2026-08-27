import { test, expect } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./auth-state";

/**
 * Админка — вне поиска и вне аналитики.
 *
 * Считать там нечего: это рабочий инструмент владельца, а не аудитория
 * сайта. Свои заходы разбавляли бы статистику, а внешние счётчики
 * получали бы адреса служебных страниц вместе с id записей в них.
 *
 * robots.txt закрывает /admin, но это просьба: адрес, попавший
 * поисковику по ссылке, он вправе показать в выдаче и без обхода.
 * Поэтому на самих страницах ещё и noindex — и на защищённых, и на
 * странице входа, куда попадают до проверки прав.
 */
const ANALYTICS_HOSTS = ["mc.yandex", "googletagmanager", "google-analytics"];

test.describe("админка вне индекса и вне аналитики", () => {
  test("страница входа: noindex, счётчиков нет", async ({ page }) => {
    await page.goto("/admin");
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(robots).toContain("noindex");
    const html = await page.content();
    for (const host of ANALYTICS_HOSTS) expect(html).not.toContain(host);
  });

  // Под входом: без него /admin/dramas уводит на публичный /login, где
  // счётчики как раз законны, и проверка ловила бы не то.
  test.describe("под входом", () => {
    test.use({ storageState: ADMIN_STORAGE_STATE });
    test("внутренние страницы: noindex, счётчиков нет", async ({ page, context }) => {
    await context.addCookies([
      { name: "cookie_consent", value: "all", domain: "localhost", path: "/" },
    ]);
    await page.goto("/admin/dramas");
    expect(page.url()).toContain("/admin/dramas");
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(robots).toContain("noindex");
    const html = await page.content();
    for (const host of ANALYTICS_HOSTS) expect(html).not.toContain(host);
    // И баннера согласия там тоже нет — соглашаться не на что.
    await expect(page.getByRole("button", { name: /Accept all|Принять все/ })).toHaveCount(0);
    });
  });

  test("robots.txt закрывает /admin", async ({ request }) => {
    const body = await (await request.get("/robots.txt")).text();
    expect(body).toContain("/admin");
  });
});

test.describe("на публичных страницах всё по-прежнему", () => {
  test.use({ storageState: ADMIN_STORAGE_STATE });
  test("баннер согласия показывается", async ({ page }) => {
    await page.goto("/dramas");
    const robots = await page.locator('meta[name="robots"]').count();
    expect(robots).toBe(0);
    await expect(page.getByRole("button", { name: /Accept all|Принять все/ })).toBeVisible();
  });
});
