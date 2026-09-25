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

// Избранное у событий убрано (2026-09-26: его закрывают «иду» и
// «возможно пойду»), сердечко осталось у артистов — его и проверяем.
test("a new user can sign up and favorite an artist", async ({ page }) => {
  const email = `smoke-fav-${Date.now()}@example.com`;
  const password = "smoketest123";

  try {
    await signupTestUser(page, email, password);

    await page.goto("/artists");
    const firstArtistLink = page.locator('a[href^="/artists/"]').first();
    test.skip((await firstArtistLink.count()) === 0, "no artists in the database to favorite");
    await Promise.all([page.waitForURL(/\/artists\/[^/]+$/), firstArtistLink.click()]);

    await page.getByRole("button", { name: "Add to favourites" }).click();
    await expect(page.getByRole("button", { name: "Remove from favourites" })).toBeVisible();

    // Confirm it stuck (not just optimistic client state) by reloading.
    // domcontentloaded, не load: полной загрузки можно ждать дольше
    // таймаута — постеры событий приходят с внешних CDN (TTM отвечал и
    // по 12+ секунд), а для проверки кнопки картинки не нужны.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Remove from favourites" })).toBeVisible();
  } finally {
    runDbScript("cleanup-test-user.ts", email);
  }
});
