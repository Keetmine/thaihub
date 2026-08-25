import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

/**
 * Ж6: на какой серии человек остановился.
 *
 * Главное здесь не сам счётчик, а то, что он двигает статус: досмотрел
 * последнюю — сериал уходит в «Просмотрено», убавил — возвращается в
 * «Смотрю сейчас». Без этого список «Смотрю сейчас» врёт, а заметить
 * это на глаз трудно — счётчик-то показывает правильное число.
 */

const DRAMA = "/dramas/the-queen"; // 22 серии

async function setStatus(page: import("@playwright/test").Page, label: string) {
  // Меню статуса живёт порталом в body и закрывается на любой скролл
  // (иначе оно уезжает от кнопки в скроллящихся рядах постеров).
  // Поэтому доводим кнопку до вида ДО открытия, иначе прокрутка к
  // пункту меню это же меню и закроет.
  const trigger = page.locator(".drama-status-btn button").first();
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  await page.locator(".drama-status-dropdown button", { hasText: label }).first().click();
  await expect(trigger).toHaveAttribute("aria-label", new RegExp(label));
}

test("счётчик серий двигает статус в обе стороны", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(DRAMA);

  await setStatus(page, "Watching now");
  const counter = page.locator(".episode-progress-count");
  await expect(counter).toBeVisible();

  // «Просмотрено» руками — счётчик обязан догнать: досчитывать серии
  // после этого человек не должен.
  await setStatus(page, "Watched");
  await expect(counter).toHaveText("22 / 22");

  // Убавили — сериал снова смотрится, а не досмотрен.
  await page.getByRole("button", { name: "One episode back" }).click();
  await expect(counter).toHaveText("21 / 22");
  await expect(page.locator(".drama-status-btn button").first()).toHaveAttribute(
    "aria-label",
    /Watching now/,
  );

  // И обратно: последняя серия закрывает сериал сама.
  await page.getByRole("button", { name: "One more episode" }).click();
  await expect(counter).toHaveText("22 / 22");
  await expect(page.locator(".drama-status-btn button").first()).toHaveAttribute(
    "aria-label",
    /Watched/,
  );
});

test("на главной прогресс виден и его можно двигать оттуда", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(DRAMA);
  // Доводим до известного числа независимо от того, что осталось от
  // предыдущего теста: «Просмотрено» ставит счётчик на конец, минус —
  // на серию назад. Иначе сериал ушёл бы из «Смотрю сейчас» и на
  // главной проверять было бы нечего.
  await setStatus(page, "Watched");
  await page.getByRole("button", { name: "One episode back" }).click();
  await expect(page.locator(".episode-progress-count")).toHaveText("21 / 22");
  // Счётчик рисуется оптимистично, до ответа сервера. Дожидаемся именно
  // серверного признака — статус вернулся в «Смотрю сейчас», — иначе
  // уходим со страницы раньше, чем запись долетит.
  await expect(page.locator(".drama-status-btn button").first()).toHaveAttribute(
    "aria-label",
    /Watching now/,
  );

  await page.goto("/");
  const bar = page.locator(".poster-tile .episode-progress-bar > span").first();
  await expect(bar).toHaveAttribute("style", /width:\s*95%/);

  // Кнопка на карточке — ровно то, что человек жмёт, досмотрев серию.
  await page.getByRole("button", { name: "Mark one more episode as watched" }).first().click();
  // 22 из 22 — сериал досмотрен и из «Смотрю сейчас» уходит вместе с кнопкой.
  await expect(
    page.getByRole("button", { name: "Mark one more episode as watched" }),
  ).toHaveCount(0);
});
