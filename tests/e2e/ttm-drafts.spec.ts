import { test, expect } from "@playwright/test";
import { execFileSync } from "child_process";
import path from "path";
import { ADMIN_STORAGE_STATE } from "./auth-state";

// Сессия админа из setup-проекта — без собственного входа (лимит логина).
test.use({ storageState: ADMIN_STORAGE_STATE });

/**
 * Смоук очереди черновиков краулера афиши TTM (вкладка «События» на
 * /admin/imports, docs/features/ttm-crawl.md): фикстурный черновик
 * рисуется карточкой с чипом совпавшего артиста, «Отклонить» через
 * подтверждение убирает его из очереди. Фикстуры создаются/убираются
 * отдельными tsx-процессами (Prisma в спеки не импортировать).
 */

const runTsx = (script: string) =>
  execFileSync("npx", ["tsx", path.join(__dirname, script)], {
    cwd: path.join(__dirname, "../.."),
  });

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
});
