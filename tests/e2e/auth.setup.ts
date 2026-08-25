import { test as setup } from "@playwright/test";
import { loginAsAdmin } from "./helpers";
import { ADMIN_STORAGE_STATE } from "./auth-state";

/**
 * Единственный вход за прогон.
 *
 * Раньше почти каждая спека звала loginAsAdmin сама — выходило ~14
 * входов, а у формы входа лимит 30 попыток за 10 минут с одного IP
 * (src/lib/rateLimit.ts). Два прогона подряд ещё проходили, третий
 * рассыпался таймаутами на waitForURL — и выглядело это как поломка
 * приложения. Плюс каждый вызов заново поднимал tsx-процесс с Prisma.
 *
 * Теперь входим здесь один раз и раздаём состояние остальным проектам
 * через dependencies + use.storageState (см. playwright.config.ts).
 */
setup("вход админом", async ({ page }) => {
  // loginAsAdmin заодно создаёт тестового админа отдельным tsx-процессом
  // (Prisma ESM-only) и закрепляет куку locale=en — в сохранённое
  // состояние обязаны попасть обе куки, иначе спеки начнут падать на
  // ненайденных английских подписях.
  await loginAsAdmin(page);
  await page.context().storageState({ path: ADMIN_STORAGE_STATE });
});
