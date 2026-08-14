import { execFileSync } from "child_process";
import path from "path";
import { test, expect } from "@playwright/test";
import { signupTestUser } from "./helpers";

// Prisma's generated client is ESM-only and Playwright Test's own module
// loader can't import it directly, so cleanup runs as a separate `tsx`
// process instead of an in-process Prisma call.
function cleanupTestUser(email: string) {
  execFileSync("npx", ["tsx", path.join(__dirname, "cleanup-test-user.ts"), email], {
    cwd: path.join(__dirname, "../.."),
    stdio: "inherit",
  });
}

test("a new user can sign up and favorite an event", async ({ page }) => {
  const email = `smoke-fav-${Date.now()}@example.com`;
  const password = "smoketest123";

  try {
    await signupTestUser(page, email, password);

    await page.goto("/");
    const firstEventLink = page.locator('a[href^="/event/"]').first();
    test.skip((await firstEventLink.count()) === 0, "no events in the database to favorite");
    await firstEventLink.click();

    await page.getByRole("button", { name: "В избранное" }).click();
    await expect(page.getByRole("button", { name: "Убрать из избранного" })).toBeVisible();

    // Confirm it stuck (not just optimistic client state) by reloading.
    await page.reload();
    await expect(page.getByRole("button", { name: "Убрать из избранного" })).toBeVisible();
  } finally {
    cleanupTestUser(email);
  }
});
