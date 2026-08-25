import { execFileSync } from "child_process";
import path from "path";
import { test, expect, type Page } from "@playwright/test";
import { signupTestUser } from "./helpers";

// Премиум-гейты — это деньги проекта: платные разделы (/events, /calendar,
// /trips) без подписки должны показывать пейволл и НЕ отдавать данных, а
// промокод — единственный способ получить подписку без Telegram Stars.
// Побочных эффектов в Telegram нет: redeemPromoCode (promoActions.ts) не
// зовёт ни notifyAdmins, ни sendTelegramMessage — проверено по коду перед
// написанием, гонять против живого dev-сервера безопасно.

// Prisma ESM-only — DB-шаги отдельными tsx-процессами (см. docs/testing.md).
function runDbScript(script: string, ...args: string[]) {
  execFileSync("npx", ["tsx", path.join(__dirname, script), ...args], {
    cwd: path.join(__dirname, "../.."),
    stdio: "inherit",
  });
}

const PASSWORD = "smoketest123";

/** Пейволл вместо данных, а не рядом с ними: заглушка видна, ссылок на
 *  события нет ни одной.
 *
 *  Тест ходит по адресам без префикса — это английская версия сайта
 *  (см. docs/features/i18n.md), поэтому и строки английские. */
async function expectPaywall(page: Page, url: string, feature: string) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: `${feature} — with a subscription` }),
  ).toBeVisible();
  await expect(page.locator('a[href^="/event/"]')).toHaveCount(0);
}

test("платные разделы закрыты без подписки и открываются с ней", async ({ page }) => {
  const email = `smoke-gate-${Date.now()}@example.com`;
  try {
    await signupTestUser(page, email, PASSWORD);

    await expectPaywall(page, "/events", "The event feed");
    // Весь текст пейволла — чтобы ниже убедиться, что реальное название
    // события в нём не мелькало (сравнение с тем, что видит премиум).
    const gatedEventsText = await page.locator("body").innerText();
    await expectPaywall(page, "/calendar", "The calendar");
    await expectPaywall(page, "/trips", "Trips");

    runDbScript("set-premium-test-user.ts", email);

    // С подпиской пейволл исчезает, появляются фильтры и реальные события.
    await page.goto("/events", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: "I'm going" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /with a subscription/ })).toHaveCount(0);
    const titleLinks = page.locator('h3 a[href^="/event/"]');
    if ((await titleLinks.count()) > 0) {
      const title = (await titleLinks.first().innerText()).trim();
      expect(title.length).toBeGreaterThan(0);
      expect(gatedEventsText).not.toContain(title);
    }
    // если событий в БД нет, сравнивать нечего — как в favorites.spec.ts

    await page.goto("/calendar", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: "My events" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /with a subscription/ })).toHaveCount(0);

    await page.goto("/trips", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "+ New trip" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /with a subscription/ })).toHaveCount(0);
  } finally {
    runDbScript("cleanup-test-user.ts", email);
  }
});

test("промокод активируется один раз и открывает подписку", async ({ page }) => {
  const stamp = Date.now();
  const code = `E2E-PROMO-${stamp}`; // redeem всё равно приводит к верхнему регистру
  const firstEmail = `smoke-promo-a-${stamp}@example.com`;
  const secondEmail = `smoke-promo-b-${stamp}@example.com`;
  try {
    runDbScript("create-promo-code.ts", code, "1");

    // Свежий пользователь активирует код на пейволле афиши.
    await signupTestUser(page, firstEmail, PASSWORD);
    await page.goto("/events", { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("Promo code").fill(code);
    await page.getByRole("button", { name: "Redeem" }).click();
    // Успешная активация ревалидирует страницу (revalidatePath в
    // redeemPromoCode): пейволл — и сообщение «Подписка активна до…»
    // внутри него — исчезает, сразу появляется афиша. Поэтому ждём не
    // текст успеха, а сам результат: гейт открылся.
    await expect(page.getByRole("link", { name: "I'm going" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /with a subscription/ })).toHaveCount(0);

    // premiumUntil действительно записался: после полной перезагрузки
    // гейт всё ещё открыт (isPremiumActive читает юзера из БД, а не
    // клиентский стейт после server action).
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: "I'm going" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /with a subscription/ })).toHaveCount(0);

    // Повторная активация того же кода другим пользователем — понятная
    // ошибка (код одноразовый, помечается usedAt в транзакции).
    await page.context().clearCookies();
    await signupTestUser(page, secondEmail, PASSWORD);
    await page.goto("/events", { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("Promo code").fill(code);
    await page.getByRole("button", { name: "Redeem" }).click();
    await expect(page.getByText("This code has already been used")).toBeVisible();
  } finally {
    runDbScript("cleanup-test-user.ts", firstEmail);
    runDbScript("cleanup-test-user.ts", secondEmail);
    runDbScript("delete-promo-code.ts", code);
  }
});
