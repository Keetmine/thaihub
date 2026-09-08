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
        "Track the actors' concerts, fan meets and series: the event feed, an episode calendar, artist profiles and filming locations.",

    // Выпадашки выбора записей (EntitySelect / EntityMultiSelect).
    // Компоненты стоят и на публичных формах, и в админке, поэтому их
    // подписи живут в общем разделе, а не в словаре какой-то страницы.
    // Раньше строки были зашиты по-русски и утекали на EN-витрину
    // (аудит 2026-09, п.3).
    select: {
        placeholder: "Choose…",
        multiPlaceholder: "Start typing…",
        searchPlaceholder: "Search…",
        searchAria: "Search the list",
        searching: "Searching…",
        startTypingHint: "Start typing a name to search…",
        minTwoChars: "Type at least 2 characters",
        notSelected: "Not selected",
        create: "Create",
        // Пункт «создать по набранному» в выпадашке: кавычки у каждой
        // локали свои, поэтому шаблон целиком живёт в словаре.
        createOption: (label: string, query: string) => `+ ${label} “${query}”`,
        creating: "Creating…",
        nameLabel: "Name",
        createFailed: "Couldn't create it. Check the name and try again.",
        // «Открыть ↗» у выбранной записи — ссылка на карточку в админке.
        openCard: "Open the card in a new tab",
        openCardAria: (name: string) => `Open card: ${name}`,
        openCardText: "Open ↗",
        remove: (name: string) => `Remove ${name}`,
    },

    // LocationPicker — координаты и подсказка у карты.
    map: {
        latitude: "Latitude",
        longitude: "Longitude",
        clickToPick: "Click the map to set the point.",
    },

    // Плейсхолдер маски времени (TimeInput).
    timePlaceholder: "hh:mm",
};
