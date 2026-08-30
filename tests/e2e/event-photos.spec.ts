import { execFileSync } from "node:child_process";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./auth-state";
import { PHOTO_EVENT } from "./testAuditFixtures";

/**
 * Фото для покупающих билеты (Ж9): ряд миниатюр на странице события,
 * клик поднимает попап на весь экран, в админке — один список с
 * порядком. См. docs/features/events.md.
 *
 * Сессия — админская из setup-проекта: страница события целиком за
 * подпиской, а фикстура выдаёт админу премиум (свежий премиум-юзер
 * стоил бы лишнего входа при лимите формы). Фикстуры — отдельным
 * tsx-процессом, Prisma в спеки не импортировать (docs/testing.md).
 */
const fixtureScript = (name: string) =>
  execFileSync("npx", ["tsx", path.join(__dirname, name)], {
    cwd: path.join(__dirname, "../.."),
  });

test.beforeAll(() => fixtureScript("create-audit-fixtures.ts"));
test.afterAll(() => fixtureScript("delete-audit-fixtures.ts"));

test.use({ storageState: ADMIN_STORAGE_STATE });

const EVENT_URL = `/event/${PHOTO_EVENT.slug}`;

test("фото рендерятся рядом, клик открывает попап, попап закрывается", async ({ page }) => {
  await page.goto(EVENT_URL, { waitUntil: "domcontentloaded" });

  const thumbs = page.locator(".event-photo-thumb");
  await expect(thumbs).toHaveCount(PHOTO_EVENT.photos.length);
  // Порядок ряда — порядок поля sort.
  for (const [i, url] of PHOTO_EVENT.photos.entries()) {
    await expect(thumbs.nth(i).locator("img")).toHaveAttribute("src", url);
  }
  // Картинка действительно загрузилась, а не осталась битой ссылкой:
  // ряд из трёх пустых рамок выглядел бы в разметке ровно так же.
  await expect
    .poll(() => thumbs.first().locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);

  const lightbox = page.locator(".event-photo-lightbox");
  await expect(lightbox).toHaveCount(0);

  // 1. Клик по миниатюре — попап с той же картинкой, а не новая вкладка.
  await thumbs.nth(1).click();
  await expect(lightbox).toBeVisible();
  await expect(lightbox.locator("img")).toHaveAttribute("src", PHOTO_EVENT.photos[1]);
  expect(page.url()).toContain(PHOTO_EVENT.slug);

  // 2. Esc закрывает.
  await page.keyboard.press("Escape");
  await expect(lightbox).toHaveCount(0);

  // 3. Крестик закрывает.
  await thumbs.first().click();
  await expect(lightbox).toBeVisible();
  await lightbox.locator(".event-photo-lightbox-close").click();
  await expect(lightbox).toHaveCount(0);

  // 4. Клик мимо картинки (угол оверлея) — тоже закрывает.
  await thumbs.first().click();
  await expect(lightbox).toBeVisible();
  await lightbox.click({ position: { x: 4, y: 4 } });
  await expect(lightbox).toHaveCount(0);
});

test("в админке фото одним списком, и порядок доезжает до страницы", async ({ page }) => {
  await page.goto(`/admin/events?q=${encodeURIComponent(PHOTO_EVENT.title)}`);
  await page.getByRole("link", { name: PHOTO_EVENT.title }).first().click();
  await page.waitForSelector('input[name="title"]');

  await expect(page.getByText("Фото для покупающих билеты")).toBeVisible();
  // Один список (а не два озаглавленных блока «схема» и «бенефиты» —
  // ту версию владелец упростил до одного ряда), и кнопки добавления
  // после третьего фото нет.
  const adminPhotos = page.locator('input[name="photos"]');
  await expect(adminPhotos).toHaveCount(1);
  await expect(adminPhotos).toHaveValue(
    JSON.stringify(PHOTO_EVENT.photos.map((url) => ({ url }))),
  );
  await expect(page.getByRole("button", { name: "+ Добавить фото" })).toHaveCount(0);

  // Порядок правится стрелками: двигаем первое фото вправо и сохраняем.
  await page.getByRole("button", { name: "Правее" }).first().click();
  await expect(adminPhotos).toHaveValue(
    JSON.stringify(
      [PHOTO_EVENT.photos[1], PHOTO_EVENT.photos[0], PHOTO_EVENT.photos[2]].map((url) => ({ url })),
    ),
  );
  await page.getByRole("button", { name: "Сохранить изменения" }).click();
  await expect(page.getByText("Сохранено")).toBeVisible({ timeout: 15000 });

  await page.goto(EVENT_URL, { waitUntil: "domcontentloaded" });
  const thumbs = page.locator(".event-photo-thumb img");
  await expect(thumbs.nth(0)).toHaveAttribute("src", PHOTO_EVENT.photos[1]);
  await expect(thumbs.nth(1)).toHaveAttribute("src", PHOTO_EVENT.photos[0]);
});
