import { execFileSync } from "node:child_process";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./auth-state";
import { EPISODE_DRAMA } from "./testAuditFixtures";

/**
 * Уведомления о новых сериях (З1): отмеченный колокольчиком сериал
 * выпустил серию — «Вышла серия 5 из 10» в ленте и на счётчике в шапке.
 * См. docs/features/notifications.md.
 *
 * Telegram здесь не участвует намеренно: сообщение уходит только тому,
 * у кого привязан telegramId, а у тестового админа его нет — проверяем
 * сайтовую половину. Саму рассылку (в приложении её раз в полчаса зовёт
 * планировщик из instrumentation.ts) дёргает run-episode-notifications.ts:
 * sendEpisodeNotifications ничего от Next не хочет, только Prisma и
 * словари, поэтому зовётся прямо из tsx-процесса — как и фикстуры.
 *
 * Сессия — админская из setup-проекта: получателем нужен вошедший
 * человек, а лишний вход упёрся бы в лимит формы (docs/testing.md).
 */
const fixtureScript = (name: string, ...args: string[]) =>
  execFileSync("npx", ["tsx", path.join(__dirname, name), ...args], {
    cwd: path.join(__dirname, "../.."),
  });

test.beforeAll(() => {
  fixtureScript("create-audit-fixtures.ts");
  fixtureScript("run-episode-notifications.ts");
});
test.afterAll(() => fixtureScript("delete-audit-fixtures.ts"));

test.use({ storageState: ADMIN_STORAGE_STATE });

test("вышедшая серия появляется в ленте и на счётчике колокольчика", async ({ page }) => {
  await page.goto("/notifications", { waitUntil: "domcontentloaded" });

  // Фраза складывается при ЧТЕНИИ, на языке страницы; текст под ней
  // (body) записан один раз, на языке профиля получателя, — поэтому
  // оба ожидания устойчивы к обоим языкам.
  const n = EPISODE_DRAMA.episodeNumber;
  // Непрочитанная строка ведёт через /notifications/go/<id> (клик =
  // прочитано), поэтому ищем её по тексту, а не по прямому href на
  // сериал — прямой появляется только у уже прочитанных.
  const row = page.locator("a").filter({
    hasText: new RegExp(
      `New episode of "${EPISODE_DRAMA.title}"|Новая серия «${EPISODE_DRAMA.title}»`,
    ),
  });
  await expect(row).toHaveCount(1);
  await expect(
    row.getByText(
      new RegExp(
        `Episode ${n} of ${EPISODE_DRAMA.episodes} is out\\.|Вышла серия ${n} из ${EPISODE_DRAMA.episodes}\\.`,
      ),
    ),
  ).toBeVisible();

  // Счётчик в шапке: строка непрочитана, значит бейдж на колокольчике
  // есть. Точное число не проверяем — на живой базе у админа могут
  // лежать и чужие непрочитанные.
  await expect(page.locator(".notification-dot")).not.toHaveCount(0);

  // Строка ведёт на сериал — уведомление без входа в него бесполезно.
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/dramas/${EPISODE_DRAMA.slug}`));
});

test("переключатель «новые серии» в настройках сохраняется", async ({ page }) => {
  // Переключатели «Присылать в Telegram» видны только у аккаунта с
  // привязанным ботом — фиктивная привязка живёт ровно этот тест.
  fixtureScript("set-admin-telegram.ts", "on");
  try {
    await page.goto("/account/settings", { waitUntil: "domcontentloaded" });
    const toggle = page.locator("#tgNotifyEpisodes");
    // Весь блок Telegram рисуется только при заданном
    // TELEGRAM_BOT_USERNAME — в CI его намеренно нет (см. docs/testing.md),
    // и проверять там нечего.
    test.skip(
      (await toggle.count()) === 0,
      "TELEGRAM_BOT_USERNAME не задан — блока настроек Telegram нет",
    );
    await expect(toggle).toBeVisible();
    // Дефолт — включено; на всякий случай пляшем от текущего состояния.
    const before = await toggle.isChecked();

    const save = page.locator('form:has(#tgNotifyEpisodes) button[type="submit"]');
    await toggle.setChecked(!before);
    await save.click();
    // Серверный экшен только revalidatePath, без редиректа: ждём
    // перезагрузкой, пока страница не отдаст новое значение.
    await expect(async () => {
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator("#tgNotifyEpisodes")).toBeChecked({ checked: !before });
    }).toPass({ timeout: 15000 });

    // Возвращаем как было — настройка живёт на общем тестовом админе.
    await page.locator("#tgNotifyEpisodes").setChecked(before);
    await save.click();
    await expect(async () => {
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator("#tgNotifyEpisodes")).toBeChecked({ checked: before });
    }).toPass({ timeout: 15000 });
  } finally {
    fixtureScript("set-admin-telegram.ts", "off");
  }
});
