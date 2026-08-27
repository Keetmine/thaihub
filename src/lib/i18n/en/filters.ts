// Поиск с фильтрами (/search) и панели фильтров каталогов.
export const filters = {
    // Разделы на странице поиска и в живой выдаче шапки.
    sections: {
        all: "Everywhere",
        dramas: "Series",
        performers: "Artists",
        events: "Events",
        locations: "Locations",
        novels: "Novels",
    },

    panelTitle: "Filters",
    reset: "Reset",
    apply: "Show",
    activeCount: (n: number) => `Filters (${n})`,
    showAllOptions: (n: number) => `Show all ${n}`,
    collapseOptions: "Collapse",
    optionSearchPlaceholder: "Search the list…",
    anyOption: "Any",

    // Подписи групп. Данные-значения (названия жанров, каналов, стран)
    // не переводятся — это данные каталога, как названия сериалов.
    year: "Year",
    yearFrom: "from",
    yearTo: "to",
    genres: "Genres",
    tags: "Tags",
    country: "Country",
    type: "Type",
    status: "Status",
    network: "Network",
    agency: "Agency",
    performerKind: "Kind",
    performerKinds: {
        SOLO: "Actors",
        BAND: "Groups",
        MASCOT: "Mascots",
    },
    birthYear: "Year of birth",
    eventWhen: "When",
    eventWhenOptions: {
        upcoming: "Upcoming",
        past: "Past",
    },
    date: "Date",
    dateFrom: "from",
    dateTo: "to",
    venue: "Venue",
    author: "Author",
    onMap: "On the map",
    hasAdaptation: "Has a series adaptation",

    sort: "Sort",
    sortOptions: {
        new: "Newest first",
        rating: "By rating",
        title: "By title",
        name: "By name",
        date: "By date",
    },

    // Живой поиск в шапке.
    live: {
        allFilters: "All filters",
        seeAll: (n: number) => `Show all ${n} results`,
        empty: "Nothing found",
        hint: "Start typing a title or a name",
    },

    prevPage: "Previous",
    nextPage: "Next",
    results: (n: number) => `Results: ${n}`,
    nothingMatched: "Nothing matches these filters.",
    resetAndRetry: "Reset the filters and try a broader search.",
};
