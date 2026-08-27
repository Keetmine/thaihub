// Строки общих виджетов (модалка, подтверждение, пагинация, жалоба) —
// они не принадлежат ни одной странице, поэтому лежат отдельным
// разделом, а не в словаре какого-то одного раздела сайта. Сюда же
// попало то, что живёт над всеми страницами сразу: описание сайта для
// поиска и превью, корневой 404 и подписи в файлах календаря.
export const ui = {
    close: "Close",
    confirmTitle: "Are you sure?",
    deleting: "Deleting…",
    actionFailed: "Couldn't do that. Refresh the page and try again.",

    paginationLabel: "Pagination",
    prevPage: "‹ Back",
    nextPage: "Next ›",
    pageOf: (page: number, total: number) => `Page ${page} of ${total}`,

    report: "Report",
    reportSent: "Report sent — the moderators will take a look.",
    reportPlaceholder: "What's wrong with this content? (optional)",
    reportLabel: "What's wrong with this content",
    reportSubmit: "Send report",
    reportSending: "Sending…",
    reportFailed: "Couldn't send it",

    // Описание сайта по умолчанию: его берёт корневой layout, поэтому
    // оно достаётся каждой странице, которая не собирает метаданные
    // через pageMetadata — то есть уходит и в выдачу поиска, и в превью
    // ссылки в мессенджере.
    siteDescription:
        "Track concerts, fan meets and series with Thai actors: the event feed, an episode calendar, artist profiles and filming locations.",


};
