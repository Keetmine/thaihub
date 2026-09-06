import { execFileSync } from "child_process";
import path from "path";
import { test, expect, type Page } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./auth-state";
import { TEST_DRAMAS } from "./testDramas";

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

// Свои сериалы, а не из каталога владельца: локально `the-queen` и
// `mr-kill` есть, а в CI база одноразовая и сериалов в ней нет вовсе
// (prisma/seed.ts заводит только события и артистов) — на этом и падали
// прогоны. Prisma тут ESM-only, из spec-файла её не импортировать,
// поэтому фикстуры заводит отдельный tsx-процесс.
const fixtureScript = (name: string) =>
  execFileSync("npx", ["tsx", path.join(__dirname, name)], {
    cwd: path.join(__dirname, "../.."),
  });

test.beforeAll(() => fixtureScript("create-test-dramas.ts"));
// Убираем за собой: у разработчика база — копия боевой, и выдуманные
// сериалы после каждого прогона в каталоге лишние.
test.afterAll(() => fixtureScript("delete-test-dramas.ts"));

const ENDED = `/dramas/${TEST_DRAMAS.ended.slug}`; // вышел целиком
const AIRING = `/dramas/${TEST_DRAMAS.airing.slug}`; // ещё выходит

// Счётчик теперь инпут + «/ N» рядом (число можно ввести руками).
const counter = (page: Page) => page.locator(".episode-progress-input").first();
const totalOf = (page: Page) => page.locator(".episode-progress-count").first();

async function expectCount(page: Page, watched: number, total: number) {
  await expect(counter(page)).toHaveValue(String(watched));
  await expect(totalOf(page)).toHaveText(`of ${total}`);
}
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
    await expectCount(page, TEST_DRAMAS.ended.episodes, TEST_DRAMAS.ended.episodes);

    // Убавили — сериал снова смотрится, а не досмотрен.
    await page.getByRole("button", { name: "One episode back" }).click();
    await expectCount(page, TEST_DRAMAS.ended.episodes - 1, TEST_DRAMAS.ended.episodes);
    await expect(statusBtn(page)).toHaveAttribute("aria-label", /Watching now/);

    // И обратно: последняя серия закрывает сериал сама.
    await page.getByRole("button", { name: "One more episode" }).click();
    await expectCount(page, TEST_DRAMAS.ended.episodes, TEST_DRAMAS.ended.episodes);
    await expect(statusBtn(page)).toHaveAttribute("aria-label", /Watched/);

    // Число можно ввести руками (правка владельца): «5» с клавиатуры —
    // и статус уезжает из «Просмотрено» обратно в «Смотрю».
    await counter(page).fill("5");
    await counter(page).press("Enter");
    await expectCount(page, 5, TEST_DRAMAS.ended.episodes);
    await expect(statusBtn(page)).toHaveAttribute("aria-label", /Watching now/);

    // Мусор и выход за границы не проходят: 999 обрезается до последней
    // серии — а это закрывает сериал.
    await counter(page).fill("999");
    await counter(page).press("Enter");
    await expectCount(page, TEST_DRAMAS.ended.episodes, TEST_DRAMAS.ended.episodes);
    await expect(statusBtn(page)).toHaveAttribute("aria-label", /Watched/);
  });

  await test.step("выходящий: последняя вышедшая серия не закрывает", async () => {
    // У выходящего «последняя» — это последняя из уже вышедших, дальше
    // будут новые. Уносить такое в «Просмотрено» нельзя: человек
    // перестанет видеть сериал в «Смотрю сейчас» и пропустит продолжение.
    await page.goto(AIRING);
    // Доводим до конца заведомо, не завися от прошлых прогонов.
    await setStatus(page, "Watched");
    const total = Number((await totalOf(page).textContent())!.replace(/of|из/, "").trim());
    await page.getByRole("button", { name: "One episode back" }).click();
    await expectCount(page, total - 1, total);

    await page.getByRole("button", { name: "One more episode" }).click();
    await expectCount(page, total, total);
    await expect(statusBtn(page)).toHaveAttribute("aria-label", /Watching now/);
  });
});

test("прогресс правится из списка и с главной", async ({ page }) => {
  await test.step("список сериалов: «Просмотрено» читается как n из n", async () => {
    await page.goto(ENDED);
    await setStatus(page, "Watched");
    await expectCount(page, TEST_DRAMAS.ended.episodes, TEST_DRAMAS.ended.episodes);

    await page.goto(`/dramas?q=${encodeURIComponent(TEST_DRAMAS.ended.title)}`);
    const row = page.locator(".surface", { hasText: TEST_DRAMAS.ended.title }).first();
    await expect(row.locator(".episode-progress-value")).toHaveText(String(TEST_DRAMAS.ended.episodes));

    // И правится не уходя со страницы списка.
    await row.getByRole("button", { name: "One episode back" }).click();
    await expect(row.locator(".episode-progress-value")).toHaveText(String(TEST_DRAMAS.ended.episodes - 1));
    // Дожидаемся серверного признака: счётчик рисуется оптимистично, и
    // без этого мы ушли бы со страницы раньше, чем запись долетит.
    // Признак — подпись статуса в своей колонке (карандаш из строки
    // убран правкой владельца 2026-09-06): досмотренный минус серия
    // возвращается в «смотрю».
    await expect(row.locator(".drama-status-select-trigger")).toContainText("Watching now");
  });

  await test.step("главная: тот же счётчик на карточке", async () => {
    await page.goto("/");
    // Именно своя карточка: в «Смотрю сейчас» лежит и другое.
    const cell = page.locator(".poster-tile", { hasText: TEST_DRAMAS.ended.title }).locator("..");
    // Процент считаем от фикстуры, а не пишем числом: поменяется число
    // серий — тест не должен врать про 95%.
    const percent = Math.round(
      ((TEST_DRAMAS.ended.episodes - 1) / TEST_DRAMAS.ended.episodes) * 100,
    );
    await expect(cell.locator(".episode-progress-bar > span").first()).toHaveAttribute(
      "style",
      new RegExp(`width:\\s*${percent}%`),
    );
    // На карточке «Смотрю сейчас» число тоже стало текстом (правка
    // владельца 2026-09-06): поля ввода там больше нет.
    await expect(cell.locator(".episode-progress-value")).toHaveText(
      String(TEST_DRAMAS.ended.episodes - 1),
    );

    await cell.getByRole("button", { name: "One more episode" }).click();
    // 22 из 22 — сериал досмотрен и уходит из «Смотрю сейчас» целиком.
    await expect(page.locator(".poster-tile", { hasText: TEST_DRAMAS.ended.title })).toHaveCount(0);
  });
});
