import type { Dict } from "../en";

export const filters: Dict["filters"] = {
    sections: {
        all: "Везде",
        dramas: "Сериалы",
        performers: "Артисты",
        events: "События",
        locations: "Локации",
        novels: "Новеллы",
    },

    panelTitle: "Фильтры",
    reset: "Сбросить",
    apply: "Показать",
    activeCount: (n: number) => `Фильтры (${n})`,
    showAllOptions: (n: number) => `Показать все ${n}`,
    collapseOptions: "Свернуть",
    optionSearchPlaceholder: "Поиск по списку…",
    anyOption: "Любые",

    year: "Год",
    yearFrom: "от",
    yearTo: "до",
    genres: "Жанры",
    tags: "Теги",
    country: "Страна",
    type: "Тип",
    status: "Статус",
    network: "Канал",
    agency: "Агентство",
    performerKind: "Кто это",
    performerKinds: {
        SOLO: "Актёры",
        BAND: "Группы",
        MASCOT: "Маскоты",
    },
    birthYear: "Год рождения",
    eventWhen: "Когда",
    eventWhenOptions: {
        upcoming: "Предстоящие",
        past: "Прошедшие",
    },
    date: "Дата",
    dateFrom: "с",
    dateTo: "по",
    venue: "Площадка",
    author: "Автор",
    onMap: "Есть на карте",
    hasAdaptation: "Есть экранизация",

    sort: "Сортировка",
    sortOptions: {
        new: "Сначала новые",
        rating: "По рейтингу",
        title: "По названию",
        name: "По имени",
        date: "По дате",
    },

    live: {
        allFilters: "Все фильтры",
        seeAll: (n: number) => `Показать все результаты (${n})`,
        empty: "Ничего не нашлось",
        hint: "Начните вводить название или имя",
    },

    prevPage: "Назад",
    nextPage: "Дальше",
    results: (n: number) => `Найдено: ${n}`,
    nothingMatched: "Под эти фильтры ничего не подошло.",
    resetAndRetry: "Сбросьте фильтры или поищите шире.",
};
