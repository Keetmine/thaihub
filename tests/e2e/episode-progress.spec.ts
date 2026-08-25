import { test, expect, type Page } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./auth-state";

// Сессия админа из setup-проекта (tests/e2e/auth.setup.ts): вход на весь
// прогон один, у формы входа лимит попыток.
test.use({ storageState: ADMIN_STORAGE_STATE });

/**
 * Ж6: на какой серии человек остановился.
 *
 * Главное здесь не сам счётчик, а то, что он двигает статус: досмотрел
 * последнюю — сериал уходит в «Просмотрено», убавил — возвращается в
 * «Смотрю сейчас». Без этого список «Смотрю сейчас» врёт, а заметить
 * это на глаз трудно — счётчик-то показывает правильное число.
 *
 * Сценариев тут четыре, а тестов два: каждый заново проходит цепочку
 * статусов, и дробить её мельче — только дольше.
 */

const ENDED = "/dramas/the-queen"; // 22 серии, вышел целиком
const AIRING = "/dramas/mr-kill"; // ещё выходит

const counter = (page: Page) => page.locator(".episode-progress-count");
const statusBtn = (page: Page) => page.locator(".drama-status-btn button").first();

async function setStatus(page: Page, label: string) {
  // Меню статуса живёт порталом в body и закрывается на любой скролл
  // (иначе оно уезжает от кнопки в скроллящихся рядах постеров).
  // Поэтому доводим кнопку до вида ДО открытия, иначе прокрутка к
  // пункту меню это же меню и закроет.
  const trigger = statusBtn(page);
  await trigger.scrollIntoViewIfNeeded();

  const option = page.locator(".drama-status-dropdown button", { hasText: label }).first();
  // Клик по свежезагруженной странице может прийтись раньше гидратации:
  // кнопка уже нарисована, обработчика на ней ещё нет, и меню не
  // открывается. Пробуем, пока не откроется, но не жмём повторно на
  // открытое — вторым кликом мы бы его закрыли.
  await expect(async () => {
    if (!(await option.isVisible())) await trigger.click();
    await expect(option).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15000 });

  await option.click();
  await expect(trigger).toHaveAttribute("aria-label", new RegExp(label));
}

test("счётчик серий двигает статус — но не у выходящего сериала", async ({ page }) => {
  await test.step("вышедший целиком: последняя серия закрывает сериал", async () => {
    await page.goto(ENDED);
    await setStatus(page, "Watching now");
    await expect(counter(page)).toBeVisible();

    // «Просмотрено» руками — счётчик обязан догнать: досчитывать серии
    // после этого человек не должен.
    await setStatus(page, "Watched");
    await expect(counter(page)).toHaveText("22 / 22");

    // Убавили — сериал снова смотрится, а не досмотрен.
    await page.getByRole("button", { name: "One episode back" }).click();
    await expect(counter(page)).toHaveText("21 / 22");
    await expect(statusBtn(page)).toHaveAttribute("aria-label", /Watching now/);

    // И обратно: последняя серия закрывает сериал сама.
    await page.getByRole("button", { name: "One more episode" }).click();
    await expect(counter(page)).toHaveText("22 / 22");
    await expect(statusBtn(page)).toHaveAttribute("aria-label", /Watched/);
  });

  await test.step("выходящий: последняя вышедшая серия не закрывает", async () => {
    // У выходящего «последняя» — это последняя из уже вышедших, дальше
    // будут новые. Уносить такое в «Просмотрено» нельзя: человек
    // перестанет видеть сериал в «Смотрю сейчас» и пропустит продолжение.
    await page.goto(AIRING);
    // Доводим до конца заведомо, не завися от прошлых прогонов.
    await setStatus(page, "Watched");
    const total = Number((await counter(page).textContent())!.split("/")[1].trim());
    await page.getByRole("button", { name: "One episode back" }).click();
    await expect(counter(page)).toHaveText(`${total - 1} / ${total}`);

    await page.getByRole("button", { name: "One more episode" }).click();
    await expect(counter(page)).toHaveText(`${total} / ${total}`);
    await expect(statusBtn(page)).toHaveAttribute("aria-label", /Watching now/);
  });
});

test("прогресс правится из списка и с главной", async ({ page }) => {
  await test.step("список сериалов: «Просмотрено» читается как n из n", async () => {
    await page.goto(ENDED);
    await setStatus(page, "Watched");
    await expect(counter(page)).toHaveText("22 / 22");

    await page.goto("/dramas?q=The Queen");
    const row = page.locator(".surface", { hasText: "The Queen!" }).first();
    await expect(row.locator(".episode-progress-count")).toHaveText("22 / 22");

    // И правится не уходя со страницы списка.
    await row.getByRole("button", { name: "One episode back" }).click();
    await expect(row.locator(".episode-progress-count")).toHaveText("21 / 22");
    // Дожидаемся серверного признака: счётчик рисуется оптимистично, и
    // без этого мы ушли бы со страницы раньше, чем запись долетит.
    await expect(row.locator(".drama-status-btn button")).toHaveAttribute(
      "aria-label",
      /Watching now/,
    );
  });

  await test.step("главная: тот же счётчик на карточке", async () => {
    await page.goto("/");
    // Именно своя карточка: в «Смотрю сейчас» лежит и другое.
    const cell = page.locator(".poster-tile", { hasText: "The Queen!" }).locator("..");
    await expect(cell.locator(".episode-progress-bar > span").first()).toHaveAttribute(
      "style",
      /width:\s*95%/,
    );
    await expect(cell.locator(".episode-progress-count")).toHaveText("21 / 22");

    await cell.getByRole("button", { name: "One more episode" }).click();
    // 22 из 22 — сериал досмотрен и уходит из «Смотрю сейчас» целиком.
    await expect(page.locator(".poster-tile", { hasText: "The Queen!" })).toHaveCount(0);
  });
});
