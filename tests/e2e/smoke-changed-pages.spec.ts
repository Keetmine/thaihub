import { test, expect } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./auth-state";

// Сессия админа из setup-проекта (tests/e2e/auth.setup.ts): вход на весь
// прогон один, у формы входа лимит попыток.
test.use({ storageState: ADMIN_STORAGE_STATE });

/**
 * Проверка страниц, затронутых перестройкой импортов и модерации.
 *
 * Смысл — поймать то, что переживает компиляцию: разъехавшуюся
 * вложенность JSX после правок разметки, ссылку на удалённый маршрут,
 * пустой блок на месте вырезанной кнопки. Тип-чек и сборка на такое не
 * ругаются, а страница ломается уже у человека.
 */
test.describe("страницы после перестройки импортов", () => {
  test("импорты: вкладки журналов переключаются", async ({ page }) => {
    await page.goto("/admin/imports");
    await expect(page.getByRole("heading", { name: "Импорты" })).toBeVisible();

    // Карточки импортов: MDL добавлена, агентство tpop убрано.
    await expect(page.getByText("MyDramaList: импорт актёра")).toBeVisible();
    await expect(page.getByText("tpop.fandom: импорт артиста")).toBeVisible();
    await expect(page.getByText("tpop.fandom: импорт агентства")).toHaveCount(0);
    await expect(page.getByText("YouTube Music: дискография")).toBeVisible();

    // Массовые синки убраны из быстрых ссылок.
    await expect(page.getByText("TMDB-синк сериалов")).toHaveCount(0);
    await expect(page.getByText("TMDB/GMMTV актёры")).toHaveCount(0);

    // Вкладка «спарсенное» открыта по умолчанию, запуски — по клику.
    const runsTab = page.getByRole("link", { name: /Последние запуски/ });
    await expect(runsTab).toBeVisible();
    await runsTab.click();
    await expect(page).toHaveURL(/log=runs/);
    // Фильтр по статусу живёт на вкладке запусков и сохраняет её.
    await page.getByRole("link", { name: "Упавшие", exact: true }).click();
    await expect(page).toHaveURL(/log=runs.*status=FAILED/);
  });

  test("импорт события по ссылке живёт на странице импортов", async ({ page }) => {
    // Раньше это была отдельная страница /admin/imports/ttm; форму
    // встроили в общий список, а поле стало одним на пять сайтов
    // (распознавание по домену — см. lib/eventTicketSites.ts).
    await page.goto("/admin/imports");
    await expect(page.getByRole("heading", { name: "Событие по ссылке" })).toBeVisible();
    await expect(
      page.getByPlaceholder(/thaiticketmajor\.com \/ eventpop\.me/),
    ).toBeVisible();
    // Заголовки-группы: импорты разложены по тому, что они заводят.
    for (const group of ["Актёры и артисты", "Сериалы", "События", "Локации"]) {
      // exact: заголовок группы «События» иначе совпадает и с
      // «ThaiTicketMajor: импорт события».
      await expect(page.getByRole("heading", { name: group, exact: true })).toBeVisible();
    }
  });

  test("модерация: жалобы фильтруются по состоянию", async ({ page }) => {
    await page.goto("/admin/moderation?tab=reports");
    for (const label of ["Открытые", "Разобранные", "Все"]) {
      await expect(page.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
    await page.getByRole("link", { name: "Разобранные", exact: true }).click();
    await expect(page).toHaveURL(/state=resolved/);
  });

  test("каталоги открываются без удалённых кнопок", async ({ page }) => {
    await page.goto("/admin/performers");
    await expect(page.getByRole("button", { name: /Импортировать с TMDB/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /GMMTV/ })).toHaveCount(0);

    await page.goto("/admin/dramas");
    await expect(page.getByRole("button", { name: /Импортировать с TMDB/ })).toHaveCount(0);
  });

  test("настройки: дата рождения — кастомный календарь", async ({ page }) => {
    await page.goto("/account/settings");
    // Профиль лежит на своей вкладке.
    const profileTab = page.getByRole("link", { name: "Профиль", exact: true });
    if (await profileTab.count()) await profileTab.first().click();
    await expect(page.locator('input[type="date"]')).toHaveCount(0);
  });

  test("выпадашка года ограничена по высоте", async ({ page }) => {
    // Форма исполнителя: дата рождения со столетним диапазоном.
    await page.goto("/admin/performers/new");
    await page.locator(".date-picker-toggle").first().click();
    await page.getByRole("button", { name: "Год", exact: true }).click();

    const list = page.locator(".picker-select-list");
    await expect(list).toBeVisible();
    // Ради этого всё и делалось: нативную выпадашку не ограничить, и
    // сотня годов растягивалась на весь экран.
    const height = (await list.boundingBox())!.height;
    expect(height).toBeLessThan(260);
    expect(await page.locator(".picker-select-option").count()).toBeGreaterThan(90);
  });
});
