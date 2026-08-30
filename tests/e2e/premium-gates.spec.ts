import { execFileSync } from "child_process";
import path from "path";
import { test, expect, type Page } from "@playwright/test";
import { signupTestUser } from "./helpers";

// Премиум-гейты — это деньги проекта: платные разделы (/calendar, /trips)
// без подписки должны показывать пейволл и НЕ отдавать данных, а
// промокод — единственный способ получить подписку без Telegram Stars.
//
// У афиши (/events) гейт с тизером, а не глухой стеной: БЛИЖАЙШИЕ
// события (не больше двух) открыты честно — с названиями и ссылками, —
// а остальная лента закрыта, и её названия не должны попадать в разметку
// (см. docs/features/events.md). Тест проверяет обе половины: тизер
// виден и заперта именно остальная лента.
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

/** Сколько событий тизер вправе показать без подписки — TEASER_SIZE в
 *  src/app/(public)/events/EventsTeaser.tsx. Больше — это уже лента. */
const TEASER_SIZE = 2;

test("платные разделы закрыты без подписки и открываются с ней", async ({ page }) => {
  const email = `smoke-gate-${Date.now()}@example.com`;
  try {
    await signupTestUser(page, email, PASSWORD);

    // Афиша: тизер вместо стены. Заглушка на месте, ленты (фильтры,
    // поиск по афише) нет, а открыто ровно ближайшее — не больше двух
    // событий.
    await page.goto("/events", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "The event feed — with a subscription" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "I'm going" })).toHaveCount(0);
    const teaserLinks = page.locator('h3 a[href^="/event/"]');
    const teaserCount = await teaserLinks.count();
    expect(teaserCount).toBeLessThanOrEqual(TEASER_SIZE);
    const teaserTitles = (await teaserLinks.allInnerTexts()).map((s) => s.trim());
    // Весь текст страницы — чтобы ниже убедиться, что названия ЗАКРЫТОЙ
    // части ленты в нём не мелькали (сравнение с тем, что видит премиум).
    const gatedEventsText = await page.locator("body").innerText();

    // Страница события ПУБЛИЧНАЯ: карточка (что, когда, где) открыта и
    // без подписки, а личное вокруг неё — нет. Маркер закрытого —
    // кнопка выгрузки в календарь: она ведёт на /event/[id]/ics, а тот
    // без подписки отвечает 403.
    const teaserHref = teaserCount > 0 ? await teaserLinks.first().getAttribute("href") : null;
    if (teaserHref) {
      await page.goto(teaserHref, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1, name: teaserTitles[0] })).toBeVisible();
      await expect(page.locator('a[href*="/ics"]')).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: "Plans, tickets and reminders — with a subscription" }),
      ).toBeVisible();
    }

    await expectPaywall(page, "/calendar", "The calendar");
    await expectPaywall(page, "/trips", "Trips");

    runDbScript("set-premium-test-user.ts", email);

    // С подпиской пейволл исчезает, появляются фильтры и реальные события.
    await page.goto("/events", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: "I'm going" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /with a subscription/ })).toHaveCount(0);
    const titleLinks = page.locator('h3 a[href^="/event/"]');
    const fullTitles = (await titleLinks.allInnerTexts()).map((s) => s.trim());
    // Название из ленты, которого в тизере не было, не должно было
    // просочиться в разметку закрытой страницы.
    const hiddenTitle = fullTitles.find((title) => title && !teaserTitles.includes(title));
    if (hiddenTitle) {
      expect(gatedEventsText).not.toContain(hiddenTitle);
    }
    // если в БД только тизерные события, сравнивать нечего — как в
    // favorites.spec.ts

    // На той же странице события с подпиской появляется личное:
    // выгрузка в календарь на месте, заглушки больше нет.
    if (teaserHref) {
      await page.goto(teaserHref, { waitUntil: "domcontentloaded" });
      await expect(page.locator('a[href*="/ics"]').first()).toBeVisible();
      await expect(page.getByRole("heading", { name: /with a subscription/ })).toHaveCount(0);
    }

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
