import { execFileSync } from "node:child_process";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./auth-state";
import { CLICK_NOTIFICATION } from "./testNotificationFixture";

/**
 * Клик по уведомлению помечает ИМЕННО ЕГО прочитанным и ведёт по ссылке
 * (см. docs/features/notifications.md): непрочитанная строка идёт через
 * /notifications/go/[id], тот ставит readAt и редиректит на href.
 *
 * Счётчик проверяем через /api/notifications/unread относительно
 * (before − 1), а не точным числом: база — копия прода, у админа могут
 * лежать и другие непрочитанные, в том числе от соседних спек.
 *
 * Сессия — админская из setup-проекта (лишний вход упёрся бы в лимит
 * формы, docs/testing.md).
 */
const fixtureScript = (name: string) =>
  execFileSync("npx", ["tsx", path.join(__dirname, name)], {
    cwd: path.join(__dirname, "../.."),
  });

test.beforeAll(() => fixtureScript("create-notification-fixture.ts"));
test.afterAll(() => fixtureScript("delete-notification-fixture.ts"));

test.use({ storageState: ADMIN_STORAGE_STATE });

// Тем же роутом, которым живёт колокольчик, — page.request идёт с
// куками контекста, то есть от имени того же админа.
async function unreadCount(page: Page): Promise<number> {
  const res = await page.request.get("/api/notifications/unread");
  const data = (await res.json()) as { unread: number };
  return data.unread;
}

// Фраза складывается при ЧТЕНИИ, на языке страницы, — ждём любой из двух.
const rowText = new RegExp(
  `${CLICK_NOTIFICATION.actorName} wants to add you as a friend|` +
    `${CLICK_NOTIFICATION.actorName} хочет добавить вас в друзья`,
);

test("клик по непрочитанному уведомлению помечает его и ведёт по ссылке", async ({
  page,
}) => {
  await page.goto("/notifications", { waitUntil: "domcontentloaded" });

  // Непрочитанная строка: ведёт через go-маршрут и подсвечена.
  const row = page
    .locator('a[href*="/notifications/go/"]')
    .filter({ hasText: rowText });
  await expect(row).toHaveCount(1);
  await expect(row.locator(".notification-unread")).toBeVisible();

  const before = await unreadCount(page);
  expect(before).toBeGreaterThan(0);

  // Клик ведёт на целевую страницу уведомления (href фикстуры).
  await row.click();
  await page.waitForURL(new RegExp(`${CLICK_NOTIFICATION.href}(\\?|$)`));

  // Пометка коммитится ДО редиректа, так что счётчик меньше сразу.
  expect(await unreadCount(page)).toBe(before - 1);

  // Бейдж на колокольчике: при смене маршрута он перепрашивает счётчик
  // сам. Точное число проверяем, только пока оно влезает в бейдж
  // («9+» дальше не различить). Колокольчика в шапке два (мобильный и
  // десктопный), отсюда first().
  const after = before - 1;
  if (after === 0) {
    await expect(page.locator(".notification-dot")).toHaveCount(0);
  } else if (after <= 9) {
    await expect(page.locator(".notification-dot").first()).toHaveText(String(after));
  }

  // В ленте строка теперь прочитана: прямая ссылка на href, без
  // подсветки и без go-маршрута.
  await page.goto("/notifications", { waitUntil: "domcontentloaded" });
  const readRow = page
    .locator(`a[href$="${CLICK_NOTIFICATION.href}"]`)
    .filter({ hasText: rowText });
  await expect(readRow).toHaveCount(1);
  await expect(readRow.locator(".notification-unread")).toHaveCount(0);
});
