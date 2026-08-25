export const common = {
    all: "all →",
    more: "Read more",
    less: "Show less",
    cancel: "Cancel",
    save: "Save",
    delete: "Delete",
    edit: "Edit",
    add: "Add",
    nothingFound: "Nothing found.",
    searchByName: "Search by name…",
  loading: "Loading…",
  // Счётчик живёт здесь, а не в nav: подписи навигации типизированы
  // как простые строки (labelKey в меню), функция ломала бы этот тип.
  notificationsUnread: (n: number) => `Notifications: ${n} new`,
    year: "year",
    language: "Language",
    switchToRussian: "Русский",
    switchToEnglish: "English",
};
