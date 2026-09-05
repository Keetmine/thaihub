import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "child_process";
import path from "path";
import { ADMIN_STORAGE_STATE } from "./auth-state";

// Сессия админа из setup-проекта — без собственного входа (лимит логина).
test.use({ storageState: ADMIN_STORAGE_STATE });

/**
 * Смоук очереди черновиков краулера афиши TTM (вкладка «События» на
 * /admin/imports, docs/features/ttm-crawl.md): фикстурный черновик
 * рисуется карточкой с чипом совпавшего артиста, «Отклонить» через
 * подтверждение убирает его из очереди; массовые действия BulkList —
 * отклонение выбранных и одобрение пачкой с пропуском «возможного
 * дубля». Трогаем ТОЛЬКО фикстурные строки (метка TTMDRAFT_E2E):
 * живые черновики из копии прода выделять нельзя. Фикстуры
 * создаются/убираются отдельными tsx-процессами (Prisma в спеки не
 * импортировать).
 */

const runTsx = (script: string) =>
  execFileSync("npx", ["tsx", path.join(__dirname, script)], {
    cwd: path.join(__dirname, "../.."),
  });

/** Чекбокс bulk-строки с фикстурным черновиком — по названию, чтобы
 *  случайно не выделить живой черновик из копии прода. */
const rowCheck = (page: Page, title: string) =>
  page.locator(".bulk-row").filter({ hasText: title }).locator(".bulk-row-check");

/** Счётчик из заголовка «Черновики событий (N)». */
async function draftCount(page: Page): Promise<number> {
  const text = await page.getByText(/Черновики событий \(\d+\)/).textContent();
  return Number(text!.match(/\((\d+)\)/)![1]);
}

test.describe("очередь черновиков событий", () => {
  test.beforeAll(() => runTsx("create-ttm-draft-fixture.ts"));
  test.afterAll(() => runTsx("delete-ttm-draft-fixture.ts"));

  test("черновик виден и отклоняется", async ({ page }) => {
    await page.goto("/admin/imports?tab=events");
    await expect(page.getByText(/Черновики событий \(\d+\)/)).toBeVisible();

    // Карточка фикстурного черновика: название — ссылкой на TTM,
    // даты/площадка, чип совпавшего артиста.
    const card = page
      .locator("div.surface")
      .filter({ hasText: "TTMDRAFT_E2E Smoke Concert" })
      .last();
    await expect(card.getByRole("link", { name: /TTMDRAFT_E2E Smoke Concert/ })).toBeVisible();
    await expect(card.getByText("E2E Arena")).toBeVisible();
    await expect(card.getByRole("link", { name: "TTMDRAFT_E2E Nick" })).toBeVisible();
    // Чип «Возможный дубль» из пометки possibleDuplicateOf в payload —
    // ссылкой на наше событие, рядом с кнопками.
    await expect(
      card.getByRole("link", { name: /Возможный дубль: TTMDRAFT_E2E Existing Event/ }),
    ).toBeVisible();
    await expect(card.getByRole("button", { name: "Одобрить" })).toBeVisible();

    // «Отклонить» — с подтверждением (ConfirmForm), после него карточка
    // исчезает из очереди: черновик стал REJECTED.
    await card.getByRole("button", { name: "Отклонить" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/Отклонить черновик/)).toBeVisible();
    await dialog.getByRole("button", { name: "Отклонить" }).click();
    await expect(page.getByText("TTMDRAFT_E2E Smoke Concert")).toHaveCount(0);
  });

  test("массовое отклонение выбранных через модалку", async ({ page }) => {
    await page.goto("/admin/imports?tab=events");
    const before = await draftCount(page);

    // BulkList на месте: «выбрать все» есть, но пользуемся точечными
    // чекбоксами — в очереди могут быть живые черновики.
    await expect(page.getByText("Выбрать все на странице")).toBeVisible();
    await rowCheck(page, "TTMDRAFT_E2E Bulk Reject One").check();
    await rowCheck(page, "TTMDRAFT_E2E Bulk Reject Two").check();
    await expect(page.getByText("Выбрано: 2")).toBeVisible();

    // «Одобрить все» у черновиков нет намеренно — только выбранные.
    await expect(page.getByRole("button", { name: /Одобрить все/ })).toHaveCount(0);

    await page.getByRole("button", { name: "Отклонить выбранные" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/Отклонить выбранные черновики \(2\)/)).toBeVisible();
    await dialog.getByRole("button", { name: "Отклонить" }).click();

    await expect(page.getByText("TTMDRAFT_E2E Bulk Reject One")).toHaveCount(0);
    await expect(page.getByText("TTMDRAFT_E2E Bulk Reject Two")).toHaveCount(0);
    // Счётчик заголовка (он же бейдж вкладки) уменьшился ровно на два.
    await expect
      .poll(async () => {
        await page.reload();
        return draftCount(page);
      })
      .toBe(before - 2);
  });

  test("массовое одобрение пачкой пропускает возможный дубль", async ({ page }) => {
    await page.goto("/admin/imports?tab=events");

    await rowCheck(page, "TTMDRAFT_E2E Bulk Approve").check();
    await rowCheck(page, "TTMDRAFT_E2E Bulk Dupe").check();
    await expect(page.getByText("Выбрано: 2")).toBeVisible();

    await page.getByRole("button", { name: "Одобрить выбранные" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/Одобрить выбранные черновики \(2\)/)).toBeVisible();
    await expect(dialog.getByText(/возможный дубль.*пропустит/)).toBeVisible();
    await dialog.getByRole("button", { name: "Одобрить" }).click();

    // Пачка идёт фоном: ждём, пока обычный черновик станет APPROVED и
    // уйдёт из очереди (значит, событие реально создалось — статус
    // ставится только после успешного createEventFromTtmImport).
    await expect
      .poll(
        async () => {
          await page.reload();
          return page.getByText("TTMDRAFT_E2E Bulk Approve").count();
        },
        { timeout: 20_000 },
      )
      .toBe(0);
    // «Возможный дубль» пачка пропустила: он всё ещё PENDING в очереди.
    await expect(page.getByText("TTMDRAFT_E2E Bulk Dupe")).toBeVisible();

    // В журнале — одна карточка прогона с итогом: создано 1, пропущено
    // как возможный дубль 1.
    await page.goto("/admin/imports?tab=log&log=runs");
    const run = page
      .locator("div.surface")
      .filter({ hasText: "Черновики событий: одобрение" })
      .first();
    await expect(run).toBeVisible();
    await expect
      .poll(
        async () => {
          await page.reload();
          return run.getByText(/создано 1.*пропущено как возможные дубли: 1/).count();
        },
        { timeout: 10_000 },
      )
      .toBe(1);
  });
});
