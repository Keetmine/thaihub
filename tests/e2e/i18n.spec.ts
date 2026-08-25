import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

/**
 * Двуязычность: английский на адресах без префикса, русский под /ru.
 *
 * Проверяем не подписи (они меняются каждую неделю), а устройство:
 * какой язык отдаётся, куда ведут ссылки, что видит поисковик. Именно
 * это ломается молча — страница открывается, а canonical русской версии
 * показывает на английскую, и версии схлопываются в индексе.
 */

test("без префикса сайт английский", async ({ page }) => {
  await page.goto("/events");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("под /ru сайт русский", async ({ page }) => {
  await page.goto("/ru/events");
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
});

test("русскоязычный браузер при первом заходе попадает на /ru", async ({ browser }) => {
  const ctx = await browser.newContext({ locale: "ru-RU" });
  const page = await ctx.newPage();
  await page.goto("/events");
  expect(new URL(page.url()).pathname).toBe("/ru/events");
  await ctx.close();
});

test("англоязычный браузер остаётся без префикса", async ({ browser }) => {
  const ctx = await browser.newContext({ locale: "en-GB" });
  const page = await ctx.newPage();
  await page.goto("/events");
  expect(new URL(page.url()).pathname).toBe("/events");
  await ctx.close();
});

test("переключатель уводит на ту же страницу в другом языке и запоминает выбор", async ({
  page,
}) => {
  await page.goto("/events");
  await page.getByRole("button", { name: "RU", exact: true }).click();
  await page.waitForURL(/\/ru\/events$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");

  // Выбор живёт в куке — иначе следующий заход снова определялся бы по
  // браузеру и откатывал бы человека обратно.
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === "locale")?.value).toBe("ru");

  await page.goto("/events");
  expect(new URL(page.url()).pathname).toBe("/ru/events");
});

test("canonical и hreflang у каждой версии свои", async ({ page }) => {
  for (const [path, canonical] of [
    ["/events", "/events"],
    ["/ru/events", "/ru/events"],
  ]) {
    await page.goto(path);
    const href = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(new URL(href!).pathname, `canonical ${path}`).toBe(canonical);

    const alternates = await page.locator('link[rel="alternate"]').evaluateAll((links) =>
      links.map((l) => ({
        lang: l.getAttribute("hreflang"),
        path: l.getAttribute("href") ? new URL(l.getAttribute("href")!).pathname : null,
      })),
    );
    expect(alternates, `hreflang ${path}`).toEqual(
      expect.arrayContaining([
        { lang: "en", path: "/events" },
        { lang: "ru", path: "/ru/events" },
        { lang: "x-default", path: "/events" },
      ]),
    );
  }
});

test("ссылки внутри русской версии остаются в ней", async ({ page }) => {
  await page.goto("/ru/events");
  const internal = await page
    .locator('a[href^="/"]:not([href^="//"])')
    .evaluateAll((links) => links.map((l) => l.getAttribute("href")!));

  // Служебные разделы префикса не получают: админка одноязычная, а
  // api/файлы — не страницы вовсе.
  const stray = internal.filter(
    (h) => !h.startsWith("/ru") && !/^\/(admin|api|files|sitemap\.xml|robots\.txt)(\/|$|\?)/.test(h),
  );
  expect(stray, "ссылки без префикса на русской странице").toEqual([]);
});

test("админка остаётся русской, хотя живёт без префикса", async ({ page }) => {
  // Адресов с префиксом у админки нет, значит по общему правилу она
  // получила бы английский — и общие с публичной частью виджеты
  // заговорили бы там вперемешку с русскими подписями самой админки.
  await loginAsAdmin(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
});
