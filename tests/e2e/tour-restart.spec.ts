import { test, expect } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./auth-state";

/**
 * «Пройти заново» в настройках: клик должен РЕАЛЬНО запускать тур, а не
 * молча сбрасывать флаг (как было: тур стартует только с главной, и
 * человек оставался в настройках ни с чем). Теперь экшен уводит на
 * главную с ?tour=1, метку ловит ProductTour и стартует сразу.
 *
 * Сессия — общая админская из setup-проекта (лимит входов, docs/testing.md).
 * Тест самовосстанавливающийся: в конце тур закрывается, а completeTour
 * возвращает отметку прохождения — иначе тур перекрывал бы интерфейс
 * соседним спекам.
 */
test.use({ storageState: ADMIN_STORAGE_STATE });

test("кнопка «Пройти заново» запускает тур с первого шага", async ({ page }) => {
  await page.goto("/account/settings", { waitUntil: "domcontentloaded" });

  // У свежепересозданного админа отметка стоит → «Take it again»; если
  // прошлый прогон оборвался, флаг мог остаться сброшенным → «Start the tour».
  await page.getByRole("button", { name: /Take it again|Start the tour/ }).click();

  // Экшен уводит на главную с меткой запуска; первый шаг сам ведёт на
  // афишу — просто ждём видимую подсказку тура.
  await page.waitForURL((url) => url.pathname === "/" || url.pathname === "/events");
  await expect(page.locator(".tour-tip")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".tour-tip-title")).toHaveText(/event feed|Афиша/);

  // Закрываем тур; finish() зовёт completeTour — отметка возвращается,
  // и кнопка в настройках снова «Take it again». Заодно это и проверка,
  // что закрытие сохраняется на сервере.
  await page.locator(".tour-tip").getByRole("button", { name: /Skip|Пропустить/ }).click();
  await expect(page.locator(".tour-tip")).toHaveCount(0);
  await expect(async () => {
    await page.goto("/account/settings", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /Take it again/ })).toBeVisible();
  }).toPass({ timeout: 15000 });
});
