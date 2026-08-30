import type { Dict } from "../en";
import { plural } from "@/lib/plural";

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
  notificationsUnread: (n: number) => `Уведомления: ${n} ${plural(n, ["новое", "новых", "новых"])}`,
  userFallback: "Пользователь",
  deletedAccount: "Удалённый аккаунт",
    year: "год",
    language: "Язык",
    switchToRussian: "Русский",
    switchToEnglish: "English",
};
