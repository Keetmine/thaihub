import type { Dict } from "../en";

export const common: Dict["common"] = {
    all: "все →",
    more: "Читать дальше",
    less: "Свернуть",
    cancel: "Отмена",
    save: "Сохранить",
    delete: "Удалить",
    edit: "Редактировать",
    add: "Добавить",
    nothingFound: "Ничего не найдено.",
    searchByName: "Поиск по названию…",
  loading: "Загружаем…",
  notificationsUnread: (n: number) => `Уведомления: ${n} новых`,
  userFallback: "Пользователь",
  deletedAccount: "Удалённый аккаунт",
    year: "год",
    language: "Язык",
    switchToRussian: "Русский",
    switchToEnglish: "English",
};
