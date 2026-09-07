/**
 * Каталог: сериалы, артисты, новеллы, локации, агентства — списки,
 * карточки записей и общие для них компоненты (алфавитный список,
 * кнопка статуса просмотра, блок источников).
 */
export const catalog = {
    // Общее для каталожных страниц.
    eyebrow: "Catalogue",
    all: "All",
    searchByTitle: "Search by title…",
    searchByName: "Search by name…",
    loadingMore: "Loading more…",
    letterIndex: "Jump to a letter",
    // С-5: серверные страницы буквы (?letter=X) — полный список записей
    // на эту букву обычными ссылками, чтобы каталог был проходим
    // краулером.
    letterTitle: (letter: string) => `Starting with “${letter}”`,
    letterAll: "All letters:",
    letterBack: "← Full catalogue",
    showAll: (n: number) => `Show all (${n})`,
    /** «Показать всех» годится составу актёров, но не песням —
     *  в русском это разные слова (правка владельца 2026-09-06). */
    showAllItems: (n: number) => `Show all (${n})`,
    sources: "Sources",
    tagsShowAll: (n: number) => `+${n} more`,

    // Хлебные крошки (BreadcrumbList) на детальных страницах каталога.
    // Названия ступеней НАМЕРЕННО повторяют видимый текст ссылки-возврата
    // вверху страницы, только без стрелки: Google просит, чтобы разметка
    // крошек совпадала с тем, что человек реально видит. Меняете `back` —
    // поменяйте и здесь.
    breadcrumb: {
        home: "Home",
        dramas: "All series",
        artists: "All artists",
        mascots: "All mascots",
        novels: "All novels",
        agencies: "All agencies",
        locations: "All locations",
    },

    // Отметка просмотра: подписи статусов и кнопка-переключатель.
    watchStatus: {
        WATCHING: "Watching now",
        COMPLETED: "Watched",
        ON_HOLD: "On hold",
        PLAN_TO_WATCH: "Plan to watch",
        DROPPED: "Dropped",
    },
    watchStatusNone: "Not marked",

    /** Ответы серверных экшенов отметок просмотра. */
    errors: {
        badStatus: "Unknown watch status",
        badEpisodes: "Invalid episode count",
        badRating: "Invalid rating",
        dramaNotFound: "Series not found",
    },

    /** АА2: своя оценка сериалу — отдельно от общей оценки MyDramaList. */
    rating: {
        label: "My rating",
        none: "Rate",
        set: (n: string) => `My rating: ${n} out of 10`,
        choose: (n: string) => `Rate ${n} out of 10`,
        clear: "Remove rating",
        hint: (n: string) => `${n} out of 10`,
    },

    /** Ж6: на какой серии человек остановился. */
    episodes: {
        label: "Episodes",
        of: (watched: number, total: number) => `${watched} of ${total}`,
        ofTotal: (total: number) => `of ${total}`,
        plus: "One more episode",
        minus: "One episode back",
    },
    watchStatusSet: "Set a watch status",
    episodeBellOn: "New-episode notifications are on",
    episodeBellOff: "Notify me about new episodes",
    watchStatusIs: (label: string) => `Status: ${label}`,

    // Статус производства сериала — бейджем у названия и на постерах.
    dramaStatus: {
        RETURNING_SERIES: "Airing",
        PLANNED: "Planned",
        IN_PRODUCTION: "In production",
        ENDED: "Finished",
        CANCELED: "Cancelled",
        PILOT: "Pilot",
    },

    /** Тип записи из MDL (`Drama.type` — свободная строка, не enum). */
    dramaType: (raw: string): string =>
        ((
            {
                Drama: "Series",
                "TV Show": "Show",
                "TV Program": "Show",
            } as Record<string, string>
        )[raw] ?? raw),

    /** Страна производства — MDL и так пишет по-английски. */
    dramaCountry: (raw: string): string => raw,

    /** Подписи колонок таблицы сериалов. Общие для каталога /dramas и
     *  вкладки «Сериалы» в профиле: таблицы задуманы роднёй, и два
     *  словаря разъехались бы («Статус просмотра» против «Статус»). */
    dramaColumns: {
        title: "Title",
        status: "Status",
        type: "Type",
        year: "Year",
        country: "Country",
        episodes: "Episodes",
        rating: "Rating",
    },

    albumType: {
        ALBUM: "Album",
        EP: "EP",
        SINGLE: "Single",
    },
    // Песня без альбома — стоит в ленте новинок там же, где тип релиза.
    songType: "Song",

    locationCategory: {
        CAFE: "Café",
        RESTAURANT: "Restaurant",
        SHOP: "Shop",
        MALL: "Mall",
        HOTEL: "Hotel",
        PHOTO_SPOT: "Photo spot",
        LANDMARK: "Landmark",
        PARK: "Park",
        TRANSPORT: "Transport",
        OTHER: "Other",
    },

    // День недели, в который выходят серии (MDL отдаёт английское имя).
    airedOn: {
        Monday: "Mondays",
        Tuesday: "Tuesdays",
        Wednesday: "Wednesdays",
        Thursday: "Thursdays",
        Friday: "Fridays",
        Saturday: "Saturdays",
        Sunday: "Sundays",
    },

    dramas: {
        calendarLink: "Episode calendar",
        metaTitle: "Series",
        metaDescription:
            "Series: what they are about, who stars in them, when they aired and where they were filmed.",
        title: "Series",
        empty: "Nothing marked yet. Use the search to find a series.",
        // Подпись справа от заголовка идёт тремя строками, и переносы
        // прибиты разметкой (макет владельца): три ключа, три абзаца.
        heroLead1: "Only the series you",
        heroLead2: "have marked are here.",
        heroCta: "Not on the list — search by title.",
    },

    drama: {
        metaTitle: "Series",
        metaNotFound: "This series is not in the catalogue.",
        metaDescription: (title: string) =>
            `${title}: cast, filming locations, events and reviews on MyBLHub.`,
        back: "← All series",
        studio: "Studio:",
        studios: "Studios:",
        basedOn: "Based on the novel:",
        genres: "Genres:",
        tags: "Tags:",
        country: "Country:",
        type: "Type:",
        network: "Network:",
        episodes: "Episodes:",
        aired: "Aired:",
        director: "Director:",
        screenwriter: "Writer:",
        contentRating: "Rating:",
        ourScore: "Score:",
        mdlScore: "MyDramaList:",
        ourScoreTip: (n: number) => `MyBLHub viewers · ${n} votes`,
        mdlScoreTip: "MyDramaList rating",
        scoreTooltip: (site: string | null, mdl: string | null) => {
            if (site && mdl) {
                return `Series rating: MyBLHub viewers — ${site}, MyDramaList — ${mdl}`;
            }
            if (site) return `Series rating from MyBLHub viewers — ${site}`;
            return `Series rating from MyDramaList — ${mdl}`;
        },
        events: "Events",
        cast: "Cast",
        related: "Related series",
        similar: "You may also like",
        locations: "Locations",

        // График выхода серий (DramaEpisode).
        schedule: {
            title: "Episode schedule",
            aired: (n: number, total: number) => `${n} of ${total} aired`,
            episode: (n: number) => `Episode ${n}`,
            noDate: "date not announced",
            today: "today",
            showAll: (n: number) => `Show all (${n})`,
    /** «Показать всех» годится составу актёров, но не песням —
     *  в русском это разные слова (правка владельца 2026-09-06). */
            // Переключатель свёртки в конце строки «Эфир».
            more: "Details",
            hide: "Hide",
            /** Таймер под постером: сколько осталось до ближайшей серии
             *  (просьба владельца 2026-09-07). Дни считает страница, здесь
             *  только фраза. */
            /** Таймер под постером: крупно остаток, под ним подпись. */
            nextEpisodeLeft: (days: number) => {
                if (days === 0) return "Today";
                if (days === 1) return "Tomorrow";
                return `${days} days`;
            },
            nextEpisodeCaption: (n: number) => `episode ${n}`,
            nextEpisodeTitle: "Next episode",
        },
    },

    artists: {
        metaTitle: "Artists",
        metaDescription:
            "A catalogue of actors and groups: profiles, series, concerts and fan meets, discography.",
        tabPerformers: "Actors",
        tabBands: "Groups",
        tabMascots: "Mascots",
        tabAgencies: "Agencies",
        titlePerformers: "Actors",
        titleBands: "Groups",
        titleMascots: "Mascots",
        titleAgencies: "Agencies",
        favorites: "Favourites",
        // Подпись справа от заголовка идёт тремя строками, и переносы
        // прибиты разметкой (макет владельца): три ключа, три абзаца.
        heroLead1: "Favourites and artists",
        heroLead2: "with events in the feed.",
        heroCta: "Not on the list — search by name.",
        artistCount: (n: number) => `${n} ${n === 1 ? "artist" : "artists"}`,
        emptyAgencies: "No agencies yet.",
        emptyBands: "No bands yet.",
        emptyMascots: "No mascots yet.",
        emptyFavorites: "Nothing in your favourites yet. Use the search to find an actor.",
    },

    artist: {
        metaTitle: "Artist",
        metaNotFound: "Profile not found.",
        metaDescription: (name: string) =>
            `${name}: profile, series, events and discography on MyBLHub.`,
        back: "← All artists",
        backMascots: "← All mascots",
        birthDate: "Date of birth:",
        age: (years: number) => `${years} years old`,
        nationality: "Nationality:",
        alsoKnownAs: "Also known as:",
        performsAs: "Performs as:",
        placeOfBirth: "Place of birth:",
        occupation: "Occupation:",
        instruments: "Instruments:",
        soloDebut: "Solo debut:",
        height: "Height:",
        weight: "Weight:",
        agency: "Agency:",
        agencies: "Agencies:",
        members: "Members",
        brands: "Personal brands",
        mascotOf: "Mascot of",
        pairedWith: "Paired with",
        pastPairings: "Former pairings",
        mascots: "Mascots",
        band: "Band",
        events: "Events",
        upcoming: (n: number) => `Upcoming (${n})`,
        past: (n: number) => `Past (${n})`,
        noPast: "No past events.",
        noUpcoming: "No upcoming events.",
        series: "Series",
        movies: "Movies",
        shows: "Shows",
        albums: "Albums",
        songs: "Songs and singles",
        mvAppearances: "Music video appearances",
        awards: "Awards and nominations",
        trivia: "Trivia",
    },

    novels: {
        metaTitle: "Novels",
        metaDescription:
            "The novels behind the series: authors, plots and the adaptations they inspired.",
        title: "Novels",
        search: "Search by title or author…",
        empty: "Novels are on the way.",
    },

    novel: {
        metaTitle: "Novel",
        metaNotFound: "This novel is not in the catalogue.",
        metaDescription: (name: string) =>
            `${name}: what the novel is about and which series came out of it.`,
        back: "← All novels",
        adaptationCount: (n: number) => `${n} ${n === 1 ? "adaptation" : "adaptations"}`,
        originalAuthor: "Original author:",
        size: "Length:",
        whereToRead: "Where to read",
        adaptations: "Adaptations",
    },

    agency: {
        metaTitle: "Agency",
        metaNotFound: "This agency is not in the catalogue.",
        metaDescription: (name: string) =>
            `${name}: the agency's artists, their series and events on MyBLHub.`,
        back: "← All agencies",
        artistCount: (n: number) => `${n} ${n === 1 ? "artist" : "artists"}`,
        seriesCount: (n: number) => `${n} series`,
        tabArtists: (n: number) => `Artists (${n})`,
        tabSeries: (n: number) => `Series (${n})`,
        noArtistsFound: "No one matched.",
        emptyArtists: "No artists here yet.",
        emptySeries: "No series here yet.",
    },

    locations: {
        metaTitle: "Filming locations",
        metaDescription:
            "Places where series were filmed: addresses, a map and the series shot there.",
        title: "Locations",
        onMap: "On the map",
        myPlacesLink: "My places and lists →",
        tabAlphabet: "A to Z",
        tabByDrama: "By series",
        tabAllMine: (n: number) => `All my places (${n})`,
        empty: "No locations yet.",
        emptyTitle: "No locations yet",
        emptyHint: "We add filming spots little by little — do look in later.",
        noSeries: "No series",
        listNotFound: "List not found.",
        openWholeList: "Open the whole list →",
        emptyList: "This list has no places yet.",
        myPlacesHintBefore: "Places you added yourself. A new one starts in ",
        myPlacesHintLink: "My places",
        myPlacesHintAfter: " — no list needed for that.",
        emptyMine: "You have not added any places yet.",
    },

    location: {
        metaTitle: "Location",
        metaNotFound: "This location is not in the catalogue.",
        metaDescription: (name: string) =>
            `${name}: a series filming spot — how to get there and what was shot here.`,
        back: "← All locations",
        filmedHere: (n: number) => `${n} series filmed here`,
        series: "Series",
        eventsHere: "Events here",
        onMap: "On the map",
        nearby: "Other spots from these shoots",
    },

    map: {
        metaTitle: "Locations map",
        metaDescription:
            "A map of series filming spots: where scenes were shot, what is nearby and how to get there.",
        title: "Locations map",
        back: "← All locations",
    },
};
