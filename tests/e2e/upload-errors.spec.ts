import { test, expect } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./auth-state";

// Сессия админа из setup-проекта (tests/e2e/auth.setup.ts): вход на весь
// прогон один, у формы входа лимит попыток.
test.use({ storageState: ADMIN_STORAGE_STATE });

/**
 * Ручки загрузки отдают машинный код ошибки, а подпись подбирает клиент.
 *
 * Так сделано потому, что язык страницы до ручки не доходит: её дёргают
 * по адресу без языкового префикса и с русской страницы тоже. Тест
 * стережёт именно контракт — если ручка снова начнёт отдавать готовую
 * фразу, под полем на английской версии появится русский текст, и
 * заметить это глазами будет непросто.
 */
test("ручка загрузки отдаёт код ошибки, а не фразу", async ({ page }) => {
  // Страницу открываем ради origin: fetch ниже идёт из контекста
  // страницы, а сессия приходит из сохранённого состояния прогона.
  await page.goto("/admin");

  const badType = await page.evaluate(async () => {
    const data = new FormData();
    data.set("file", new File(["x"], "note.txt", { type: "text/plain" }));
    const res = await fetch("/api/upload", { method: "POST", body: data });
    return { status: res.status, body: await res.json() };
  });

  expect(badType.status).toBe(400);
  expect(badType.body.error).toBe("BAD_TYPE");
  // Список форматов собирается из самого allowlist ручки — он не
  // переводится, а вот соединяющая фраза вокруг него живёт в словаре.
  expect(badType.body.formats).toContain("JPEG");
  expect(JSON.stringify(badType.body)).not.toMatch(/[А-Яа-я]/);

  const noFile = await page.evaluate(async () => {
    const res = await fetch("/api/upload", { method: "POST", body: new FormData() });
    return { status: res.status, body: await res.json() };
  });
  expect(noFile.status).toBe(400);
  expect(noFile.body.error).toBe("NO_FILE");
});
