import type { Dict } from "../en";

export const ui: Dict["ui"] = {
    close: "Закрыть",
    confirmTitle: "Точно?",
    deleting: "Удаление…",
    actionFailed: "Не удалось выполнить действие. Обновите страницу и попробуйте ещё раз.",

    paginationLabel: "Постраничная навигация",
    prevPage: "‹ Назад",
    nextPage: "Далее ›",
    pageOf: (page: number, total: number) => `Стр. ${page} из ${total}`,

    report: "Пожаловаться",
    reportSent: "Жалоба отправлена — модераторы посмотрят.",
    reportPlaceholder: "Что не так с этим контентом? (необязательно)",
    reportLabel: "Что не так с этим контентом",
    reportSubmit: "Отправить жалобу",
    reportSending: "Отправка…",
    reportFailed: "Не удалось отправить",

    siteDescription:
        "Трекер концертов, фанмитов и сериалов актёров: афиша событий, календарь выхода серий, профили артистов и места съёмок.",

    select: {
        placeholder: "Выберите…",
        multiPlaceholder: "Начните вводить…",
        searchPlaceholder: "Поиск…",
        searchAria: "Поиск по списку",
        searching: "Поиск…",
        startTypingHint: "Начните вводить название для поиска…",
        minTwoChars: "Введите минимум 2 символа",
        notSelected: "Не выбрано",
        create: "Создать",
        createOption: (label: string, query: string) => `+ ${label} «${query}»`,
        creating: "Создание…",
        nameLabel: "Название",
        createFailed: "Не удалось создать. Проверьте название и попробуйте ещё раз.",
        openCard: "Открыть карточку в новой вкладке",
        openCardAria: (name: string) => `Открыть карточку: ${name}`,
        openCardText: "Открыть ↗",
        remove: (name: string) => `Убрать ${name}`,
    },

    map: {
        latitude: "Широта",
        longitude: "Долгота",
        clickToPick: "Кликните на карте, чтобы указать точку.",
    },

    timePlaceholder: "чч:мм",
};
