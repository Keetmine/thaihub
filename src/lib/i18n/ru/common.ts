import type { Dict } from "../en";
import { plural } from "@/lib/plural";

export const common: Dict["common"] = {
    all: "все →",
    more: "Читать дальше",
    less: "Свернуть",
    cancel: "Отмена",
    save: "Сохранить",
    delete: "Удалить",
    // «Изменить», а не «Редактировать»: у карандаша одна подпись на
    // весь сайт (аудит 2026-09, п.9), эталоном взят вариант MeetupForm.
    edit: "Изменить",
    add: "Добавить",
    nothingFound: "Ничего не найдено.",
    nobodyFound: "Никого не найдено.",
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
