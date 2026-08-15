import { execFileSync } from "child_process";
import path from "path";
import { test, expect } from "@playwright/test";
import { signupTestUser } from "./helpers";

// Prisma's generated client is ESM-only and Playwright Test's own module
// loader can't import it directly, so cleanup runs as a separate `tsx`
// process instead of an in-process Prisma call.
function runDbScript(script: string, email: string) {
  execFileSync("npx", ["tsx", path.join(__dirname, script), email], {
    cwd: path.join(__dirname, "../.."),
    stdio: "inherit",
  });
}

test("a new user can sign up and favorite an event", async ({ page }) => {
  const email = `smoke-fav-${Date.now()}@example.com`;
  const password = "smoketest123";

  try {
    await signupTestUser(page, email, password);
    // События — платная функция: без подписки на главной только
    // locked-карточки без ссылок, избранное недоступно.
    runDbScript("set-premium-test-user.ts", email);

    await page.goto("/");
    const firstEventLink = page.locator('a[href^="/event/"]').first();
    test.skip((await firstEventLink.count()) === 0, "no events in the database to favorite");
    await Promise.all([page.waitForURL(/\/event\//), firstEventLink.click()]);

    await page.getByRole("button", { name: "В избранное" }).click();
    await expect(page.getByRole("button", { name: "Убрать из избранного" })).toBeVisible();

    // Confirm it stuck (not just optimistic client state) by reloading.
    // domcontentloaded, не load: полной загрузки можно ждать дольше
    // таймаута — постеры событий приходят с внешних CDN (TTM отвечал и
    // по 12+ секунд), а для проверки кнопки картинки не нужны.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Убрать из избранного" })).toBeVisible();
  } finally {
    runDbScript("cleanup-test-user.ts", email);
  }
});
