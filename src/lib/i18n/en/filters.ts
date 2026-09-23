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
  sortPopular: "Most watched first",
  sortScore: "By MyDramaList score",
  sortAired: "Newest first",
  sortTitleAz: "By title",
  panelTitle: "Filters",
    reset: "Reset",
    apply: "Show",
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
    performer: "Artist",
    releaseType: "Release type",
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

    // Подсказки под заголовками групп фильтров.
    hints: {
        year: "Both ends inclusive — leave one side empty for an open range.",
        genres: "Tick one or more; results carry ALL the chosen genres.",
        country: "Fills in as the catalogue re-imports — not every record has one yet.",
        type: "Series or movie, as the source labels it.",
        status: "One at a time.",
        agency: "Tick one or more agencies.",
        performer: "Start typing a name — matching artists appear below, click one to add it.",
        releaseType: "Albums, EPs, singles or standalone songs.",
        tags: "Start typing — matching tags appear below, click one to add it.",
        performerKind: "Actors, groups or mascots — tick any.",
        date: "From and to, both days included.",
        venue: "Part of the venue name.",
        author: "Author or original author of the novel.",
    },

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
        hint: "Start typing a title or a name",
    },

    noOptionsYet: "No values yet — they will appear as the catalogue updates.",
    prevPage: "Previous",
    nextPage: "Next",
    results: (n: number) => `Results: ${n}`,
    nothingMatched: "Nothing matches these filters.",
    resetAndRetry: "Reset the filters and try a broader search.",
};
