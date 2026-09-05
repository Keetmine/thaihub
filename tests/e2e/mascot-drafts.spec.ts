import { test, expect } from "@playwright/test";
import { execFileSync } from "child_process";
import path from "path";
import { ADMIN_STORAGE_STATE } from "./auth-state";

// Сессия админа из setup-проекта — без собственного входа (лимит логина).
test.use({ storageState: ADMIN_STORAGE_STATE });

/**
 * Смоук очереди черновиков маскотов GMMTV (вкладка «Маскоты» на
 * /admin/imports, docs/features/gmmtv-mascots-import.md): фикстурный
 * черновик рисуется карточкой с чипом совпавшего владельца и серой
 * строкой «не нашли: …», «Отклонить» через подтверждение убирает его из
 * очереди, «Одобрить» создаёт маскота в каталоге. Трогаем ТОЛЬКО
 * фикстурные карточки (метка MASCOTDRAFT_E2E): в очереди могут ждать
 * живые черновики из копии прода. Фикстуры создаются/убираются
 * отдельными tsx-процессами (Prisma в спеки не импортировать).
 */

const runTsx = (script: string) =>
  execFileSync("npx", ["tsx", path.join(__dirname, script)], {
    cwd: path.join(__dirname, "../.."),
  });

test.describe("очередь черновиков маскотов", () => {
  test.beforeAll(() => runTsx("create-mascot-draft-fixture.ts"));
  test.afterAll(() => runTsx("delete-mascot-draft-fixture.ts"));

  test("черновик виден и отклоняется", async ({ page }) => {
    await page.goto("/admin/imports?tab=mascots");
    await expect(page.getByText(/Черновики маскотов \(\d+\)/)).toBeVisible();

    // Карточка: имя — ссылкой на вики, чип совпавшего владельца —
    // ссылкой на его админ-карточку, несовпавший — серым текстом.
    const card = page
      .locator("div.surface")
      .filter({ hasText: "MASCOTDRAFT_E2E Rejectable" })
      .last();
    await expect(card.getByRole("link", { name: /MASCOTDRAFT_E2E Rejectable/ })).toBeVisible();
    await expect(card.getByRole("link", { name: "MASCOTDRAFT_E2E Owner" })).toBeVisible();
    await expect(card.getByText(/не нашли: MASCOTDRAFT_E2E Ghost/)).toBeVisible();
    await expect(card.getByRole("button", { name: "Одобрить" })).toBeVisible();

    // «Отклонить» — с подтверждением (ConfirmForm), после него карточка
    // исчезает из очереди: черновик стал REJECTED.
    await card.getByRole("button", { name: "Отклонить" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/Отклонить черновик/)).toBeVisible();
    await dialog.getByRole("button", { name: "Отклонить" }).click();
    await expect(page.getByText("MASCOTDRAFT_E2E Rejectable")).toHaveCount(0);
  });

  test("одобрение создаёт маскота с владельцем", async ({ page }) => {
    await page.goto("/admin/imports?tab=mascots");
    const card = page
      .locator("div.surface")
      .filter({ hasText: "MASCOTDRAFT_E2E Approvable" })
      .last();
    await card.getByRole("button", { name: "Одобрить" }).click();

    // Черновик стал APPROVED и ушёл из очереди — статус ставится только
    // после успешного создания Performer типа MASCOT.
    await expect(page.getByText("MASCOTDRAFT_E2E Approvable")).toHaveCount(0);
    // Маскот действительно в каталоге исполнителей (список маскотов —
    // view=mascots на /admin/performers).
    await page.goto("/admin/performers?view=mascots&q=MASCOTDRAFT_E2E%20Approvable");
    await expect(page.getByText("MASCOTDRAFT_E2E Approvable").first()).toBeVisible();
  });
});
