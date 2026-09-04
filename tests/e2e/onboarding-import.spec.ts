import { execFileSync } from "child_process";
import path from "path";
import { test, expect } from "@playwright/test";
import { signupTestUser } from "./helpers";

// Шаг онбординга «перенесите список с MyDramaList» между профилем и
// выбором артистов: после сохранения ника новичок видит экран импорта,
// а «Пропустить» в один клик уводит на выбор артистов — шаг не должен
// блокировать вход на сайт. Сам импорт здесь НЕ запускается: живой
// прогон ходит на чужой сайт и упирается в наш лимит «раз в 10 минут»;
// UI и валидация формы покрыты mdl-list-import.spec.ts, разбор страницы
// — юнитами tests/unit/mdlListImport.test.ts.

// Prisma ESM-only — чистим фикстурного юзера отдельным tsx-процессом,
// как в favorites.spec.ts.
function runDbScript(script: string, email: string) {
  execFileSync("npx", ["tsx", path.join(__dirname, script), email], {
    cwd: path.join(__dirname, "../.."),
    stdio: "inherit",
  });
}

test("новичок видит шаг импорта MDL и пропускает его в один клик", async ({ page }) => {
  const email = `smoke-onboarding-${Date.now()}@example.com`;
  try {
    await signupTestUser(page, email, "smoketest123");
    await page.waitForURL(/\/welcome\/profile/);

    // Ник предзаполнен — достаточно продолжить. Клик может прийтись до
    // гидрации формы (паттерн account-deletion.spec.ts) — ретраим.
    await expect(async () => {
      await page.getByRole("button", { name: "Continue" }).click();
      await page.waitForURL(/\/welcome\/import/, { timeout: 3000 });
    }).toPass({ timeout: 20000 });

    // Шаг импорта: заголовок, поле ника из той же секции, что в
    // настройках, и заметная кнопка «Пропустить».
    // getByRole, не getByText: заголовок дублируется route-announcer'ом.
    await expect(
      page.getByRole("heading", { name: "Already keep a list on MyDramaList?" }),
    ).toBeVisible();
    await expect(page.locator("#mdl-import-input")).toBeVisible();

    await page.getByRole("link", { name: /Skip this step/ }).click();

    // Пропуск уводит на следующий шаг потока — выбор любимых артистов.
    await page.waitForURL(/\/welcome$/);
    await expect(page.getByRole("heading", { name: "Who do you love?" })).toBeVisible();
  } finally {
    runDbScript("cleanup-test-user.ts", email);
  }
});
