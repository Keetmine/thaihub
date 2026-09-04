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

    // Дефолтная вкладка — «Сериалы и актёры»: карточки MDL на месте,
    // мёртвых TMDB-синков нет.
    await expect(page.getByText("MyDramaList: импорт актёра")).toBeVisible();
    await expect(page.getByText("MyDramaList: импорт сериала")).toBeVisible();
    await expect(page.getByText("tpop.fandom: импорт агентства")).toHaveCount(0);
    await expect(page.getByText("TMDB-синк сериалов")).toHaveCount(0);
    await expect(page.getByText("TMDB/GMMTV актёры")).toHaveCount(0);

    // Музыкальные импорты переехали на свою вкладку. Клики — внутри
    // таб-бара: «События» и прочие названия есть и в сайдбаре.
    const tabBar = page.locator(".tab-bar");
    await tabBar.getByRole("link", { name: /Музыка и артисты/ }).click();
    await expect(page.getByText("tpop.fandom: импорт артиста")).toBeVisible();
    await expect(page.getByText("YouTube Music: дискография")).toBeVisible();

    // Журналы — на вкладке «Журнал»: «спарсенное» открыто по умолчанию,
    // запуски — по клику.
    await tabBar.getByRole("link", { name: /^Журнал/ }).click();
    const runsTab = page.getByRole("link", { name: /Последние запуски/ });
    await expect(runsTab).toBeVisible();
    await runsTab.click();
    await expect(page).toHaveURL(/log=runs/);
    // Фильтр по статусу живёт на вкладке запусков и сохраняет её.
    await page.getByRole("link", { name: "Упавшие", exact: true }).click();
    await expect(page).toHaveURL(/log=runs.*status=FAILED/);
    // Прямая ссылка старого вида (с дашборда) открывает журнал и без ?tab.
    await page.goto("/admin/imports?status=FAILED");
    await expect(page.getByRole("link", { name: /Последние запуски/ })).toBeVisible();
  });

  test("импорт события по ссылке живёт на странице импортов", async ({ page }) => {
    // Раньше это была отдельная страница /admin/imports/ttm; теперь
    // форма — на вкладке «События» общей страницы, а поле одно на пять
    // сайтов (распознавание по домену — см. lib/eventTicketSites.ts).
    await page.goto("/admin/imports");
    // Вкладки: импорты разложены по тому, что они заводят. Ищем внутри
    // таб-бара — «События» есть и в сайдбаре.
    const tabBar = page.locator(".tab-bar");
    for (const tabName of ["Сериалы и актёры", "Музыка и артисты", "События"]) {
      await expect(tabBar.getByRole("link", { name: new RegExp(tabName) })).toBeVisible();
    }
    // Не exact: у вкладки бывает бейдж с числом ждущих черновиков
    // краулера афиши («События 2») — см. docs/features/ttm-crawl.md.
    await tabBar.getByRole("link", { name: /^События/ }).click();
    await expect(page.getByRole("heading", { name: "Событие по ссылке" })).toBeVisible();
    await expect(
      page.getByPlaceholder(/thaiticketmajor\.com \/ eventpop\.me/),
    ).toBeVisible();
  });

  test("заявки пользователей: вкладка с массовым выбором", async ({ page }) => {
    await page.goto("/admin/imports?tab=requests");
    // Заявки живут на своей вкладке; при наличии открытых — паттерн
    // BulkList: чекбоксы, «выбрать все», bulk-бар с массовыми кнопками.
    // Ничего не запускаем и не отклоняем — только выделение.
    const selectAll = page.getByText("Выбрать все на странице");
    if (await selectAll.count()) {
      const firstCheck = page.locator(".bulk-row-check").first();
      await firstCheck.check();
      await expect(page.getByRole("button", { name: "Импортировать выбранные" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Отклонить выбранные" })).toBeVisible();
      await expect(
        page.getByRole("button", { name: /Импортировать все \(\d+\)|Импорт идёт…/ }),
      ).toBeVisible();
      await firstCheck.uncheck();
    } else {
      await expect(page.getByText("Открытых заявок нет.")).toBeVisible();
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
