import { test, expect } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./auth-state";

// Сессия админа из setup-проекта — вход на весь прогон один (лимит
// попыток у формы логина).
test.use({ storageState: ADMIN_STORAGE_STATE });

/**
 * Расписание после перестройки на вкладки: по вкладке на задачу
 * (?tab= — ключ задачи) плюс история прогонов из журнала импортов.
 * Ловим то, что переживает тип-чек: разъехавшийся JSX, потерянные
 * настройки задачи, ссылку вкладки в никуда.
 */
test.describe("расписание по вкладкам", () => {
  test("вкладки переключаются, настройки на месте", async ({ page }) => {
    await page.goto("/admin/schedule");
    await expect(page.getByRole("heading", { name: "Расписание" })).toBeVisible();

    // Дефолтная вкладка — первая задача (YouTube Music): настройки
    // целиком, включая выбор целей — он есть только у неё.
    const tabBar = page.locator(".tab-bar");
    await expect(page.getByText("YouTube Music: новинки")).toBeVisible();
    await expect(page.getByLabel("Запускать автоматически")).toBeVisible();
    await expect(page.getByLabel("Время")).toBeVisible();
    await expect(page.getByLabel("Кого проверять")).toBeVisible();
    await expect(page.getByRole("button", { name: "Запустить сейчас" })).toBeVisible();
    // История youtube-music двухчастная: сводки прогонов и спарсенное.
    await expect(page.getByRole("link", { name: /Прогоны/ })).toBeVisible();
    const itemsChip = page.getByRole("link", { name: /Спарсенное/ });
    await itemsChip.click();
    await expect(page).toHaveURL(/hist=items/);

    // Обновление MDL: своя вкладка, целей нет, спарсенного тоже
    // (прогон пишет только сводки).
    await tabBar.getByRole("link", { name: /Обновление MDL/ }).click();
    await expect(page.getByText("MyDramaList: обновление сериалов")).toBeVisible();
    await expect(page.getByLabel("Кого проверять")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Спарсенное/ })).toHaveCount(0);
    await expect(page.getByText("История прогонов")).toBeVisible();

    // Чистка: вкладка есть, история читается из журнала (kind cleanup).
    await tabBar.getByRole("link", { name: /Чистка/ }).click();
    await expect(page.getByText("Чистка просроченного")).toBeVisible();
    await expect(page.getByText("kind «cleanup»")).toBeVisible();
  });

  test("ручной запуск чистки оставляет карточку прогона", async ({ page }) => {
    await page.goto("/admin/schedule?tab=cleanup-expired");
    await expect(page.getByText("Чистка просроченного")).toBeVisible();

    // «Запустить сейчас» → модалка подтверждения. Экшен держит модалку
    // открытой до конца прогона — её закрытие и есть «чистка доработала»
    // (ждать текста сводки нельзя: он совпадает со сводкой прошлого
    // ночного прогона и виден ещё ДО завершения нового).
    await page.getByRole("button", { name: "Запустить сейчас" }).click();
    await page.getByRole("button", { name: "Запустить", exact: true }).click();
    // Ждём сам текст модалки, а не кнопку: у кнопки на время сабмита
    // меняется подпись на «Запускаем…», и «кнопка скрыта» срабатывал бы
    // мгновенно, до конца прогона.
    await expect(page.getByText(/Запустить «Чистка просроченного» сейчас/)).toBeHidden({
      timeout: 60_000,
    });

    // Прогон записался в журнал импортов и виден в истории вкладки:
    // статус задачи — «успешно», карточка прогона — «готово» со сводкой.
    await page.reload();
    await expect(page.getByText("успешно ·").first()).toBeVisible();
    await expect(page.getByText("готово").first()).toBeVisible();
    await expect(
      page.getByText(/сессий удалено \d+, токенов сброса \d+/).first(),
    ).toBeVisible();
  });
});
