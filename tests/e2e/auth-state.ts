import path from "path";

// Один файл на весь прогон: setup-проект его пишет, остальные проекты
// читают через use.storageState. Отдельный модуль нужен, чтобы путь не
// разъехался между playwright.config.ts и auth.setup.ts — импортировать
// сам setup в конфиг нельзя, там setup() вызывается на верхнем уровне.
export const ADMIN_STORAGE_STATE = path.join(
  __dirname,
  "../../playwright/.auth/admin.json",
);
