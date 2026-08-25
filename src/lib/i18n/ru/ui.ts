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
};
