export const common = {
    all: "all →",
    more: "Read more",
    less: "Show less",
    cancel: "Cancel",
    save: "Save",
    delete: "Delete",
    edit: "Edit",
    add: "Add",
    // Единственные две подписи пустого поиска на весь сайт (аудит
    // 2026-09, п.9): «ничего» — для записей, «никого» — для людей.
    // Свои варианты в разделах не заводить.
    nothingFound: "Nothing found.",
    nobodyFound: "No one found.",
    searchByName: "Search by name…",
  loading: "Loading…",
  // Счётчик живёт здесь, а не в nav: подписи навигации типизированы
  // как простые строки (labelKey в меню), функция ломала бы этот тип.
  notificationsUnread: (n: number) => `Notifications: ${n} new`,
  // Подпись человека без имени и ника — общая на весь сайт
  // (см. userDisplayName в src/lib/userProfile.ts).
  userFallback: "User",
  // Подпись удалённого аккаунта. В базе её нет: она подставляется на
  // чтении по признаку удаления, на языке зрителя.
  deletedAccount: "Deleted account",
    year: "year",
    language: "Language",
};
