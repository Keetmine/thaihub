import { plural } from "@/lib/plural";
import type { Dict } from "../en";

export const catalog: Dict["catalog"] = {
    eyebrow: "Каталог",
    all: "Все",
    searchByTitle: "Поиск по названию…",
    searchByName: "Поиск по имени…",
    loadingMore: "Загружаем ещё…",
    letterIndex: "Быстрый переход по буквам",
    letterTitle: (letter: string) => `На букву «${letter}»`,
    letterAll: "Все буквы:",
    letterBack: "← Весь каталог",
    showAll: (n: number) => `Показать всех (${n})`,
    showAllItems: (n: number) => `Показать все (${n})`,
    sources: "Источники",
    tagsShowAll: (n: number) => `ещё ${n}`,

    breadcrumb: {
        home: "Главная",
        dramas: "Все сериалы",
        artists: "Все артисты",
        mascots: "Все маскоты",
        novels: "Все новеллы",
        agencies: "Все агентства",
        locations: "Все локации",
    },

    watchStatus: {
        WATCHING: "Смотрю сейчас",
        COMPLETED: "Просмотрено",
        ON_HOLD: "Отложено",
        PLAN_TO_WATCH: "Буду смотреть",
        DROPPED: "Заброшено",
    },
    watchStatusNone: "Не отмечено",

    /** Ответы серверных экшенов отметок просмотра. */
    errors: {
        badStatus: "Некорректный статус",
        badEpisodes: "Некорректное число серий",
        dramaNotFound: "Сериал не найден",
    },

    /** Ж6: на какой серии человек остановился. */
    episodes: {
        label: "Серии",
        of: (watched: number, total: number) => `${watched} из ${total}`,
        ofTotal: (total: number) => `из ${total}`,
        plus: "Ещё одна серия",
        minus: "На серию назад",
    },
    watchStatusSet: "Добавить статус просмотра",
    episodeBellOn: "Уведомления о новых сериях включены",
    episodeBellOff: "Уведомлять о новых сериях",
    watchStatusIs: (label: string) => `Статус: ${label}`,

    dramaStatus: {
        RETURNING_SERIES: "Выходит",
        PLANNED: "Запланирован",
        IN_PRODUCTION: "В производстве",
        ENDED: "Завершён",
        CANCELED: "Отменён",
        PILOT: "Пилот",
    },

    /** Тип записи из MDL (`Drama.type` — свободная строка, не enum):
     *  переводим известные значения, незнакомое показываем как есть. */
    dramaType: (raw: string): string =>
        ((
            {
                Drama: "Сериал",
                Movie: "Фильм",
                "TV Show": "Шоу",
                "TV Program": "Шоу",
                Special: "Спешл",
            } as Record<string, string>
        )[raw] ?? raw),

    /** Подписи колонок таблицы сериалов. Общие для каталога /dramas и
     *  вкладки «Сериалы» в профиле: таблицы задуманы роднёй, и два
     *  словаря разъехались бы («Статус просмотра» против «Статус»). */
    dramaColumns: {
        title: "Название",
        status: "Статус",
        type: "Тип",
        year: "Год",
        country: "Страна",
        episodes: "Серии",
    },

    /** Страна производства (`Drama.country`, строка с MDL). */
    dramaCountry: (raw: string): string =>
        ((
            {
                Thailand: "Таиланд",
                "South Korea": "Южная Корея",
                Japan: "Япония",
                China: "Китай",
                Taiwan: "Тайвань",
                "Hong Kong": "Гонконг",
                Philippines: "Филиппины",
                Singapore: "Сингапур",
            } as Record<string, string>
        )[raw] ?? raw),

    albumType: {
        ALBUM: "Альбом",
        EP: "EP",
        SINGLE: "Сингл",
    },
    songType: "Песня",

    locationCategory: {
        CAFE: "Кафе",
        RESTAURANT: "Ресторан",
        SHOP: "Магазин",
        MALL: "Торговый центр",
        HOTEL: "Отель",
        PHOTO_SPOT: "Фотозона",
        LANDMARK: "Достопримечательность",
        PARK: "Парк",
        TRANSPORT: "Транспорт",
        OTHER: "Другое",
    },

    airedOn: {
        Monday: "по понедельникам",
        Tuesday: "по вторникам",
        Wednesday: "по средам",
        Thursday: "по четвергам",
        Friday: "по пятницам",
        Saturday: "по субботам",
        Sunday: "по воскресеньям",
    },

    dramas: {
        calendarLink: "Календарь серий",
        metaTitle: "Сериалы",
        metaDescription:
            "Сериалы: описания, актёрский состав, годы выхода и места съёмок.",
        title: "Сериалы",
        empty: "Пока нет отмеченных сериалов. Используйте поиск, чтобы найти сериал.",
        heroLead1: "Здесь только сериалы,",
        heroLead2: "которые вы отметили.",
        heroCta: "Нет в списке — ищите по названию.",
    },

    drama: {
        metaTitle: "Сериал",
        metaNotFound: "Сериал не найден.",
        metaDescription: (title: string) =>
            `${title}: актёрский состав, локации съёмок, события и отзывы на MyBLHub.`,
        back: "← Все сериалы",
        studio: "Студия:",
        studios: "Студии:",
        basedOn: "По новелле:",
        genres: "Жанры:",
        tags: "Теги:",
        country: "Страна:",
        type: "Тип:",
        network: "Канал:",
        episodes: "Эпизоды:",
        aired: "Эфир:",
        director: "Режиссёр:",
        screenwriter: "Сценарий:",
        contentRating: "Рейтинг:",
        ourScore: "Оценка MyBLHub:",
        events: "События",
        cast: "Актёрский состав",
        related: "Связанные сериалы",
        similar: "Вам может понравиться",
        locations: "Локации",

        schedule: {
            title: "График выхода серий",
            aired: (n: number, total: number) => `вышло ${n} из ${total}`,
            episode: (n: number) => `${n} серия`,
            noDate: "дата не объявлена",
            today: "сегодня",
            showAll: (n: number) => `Показать все (${n})`,
            more: "Подробнее",
            hide: "Свернуть",
        },
    },

    artists: {
        metaTitle: "Артисты",
        metaDescription:
            "Каталог актёров и групп: профили, сериалы, концерты и фанмиты, дискография.",
        tabPerformers: "Актёры",
        tabBands: "Музыкальные группы",
        tabMascots: "Маскоты",
        tabAgencies: "Агентства",
        titlePerformers: "Актёры",
        titleBands: "Музыкальные группы",
        titleMascots: "Маскоты",
        titleAgencies: "Агентства",
        favorites: "Избранное",
        heroLead1: "Избранные и артисты",
        heroLead2: "с событиями в афише.",
        heroCta: "Нет в списке — ищите по имени.",
        artistCount: (n: number) => `артистов: ${n}`,
        emptyAgencies: "Пока нет агентств.",
        emptyBands: "Пока нет групп.",
        emptyMascots: "Пока нет маскотов.",
        emptyFavorites: "Пока никого нет в избранном. Используйте поиск, чтобы найти актёра.",
    },

    artist: {
        metaTitle: "Артист",
        metaNotFound: "Профиль не найден.",
        metaDescription: (name: string) =>
            `${name}: профиль, сериалы, события и дискография на MyBLHub.`,
        back: "← Все артисты",
        backMascots: "← Все маскоты",
        birthDate: "Дата рождения:",
        age: (years: number) => `${years} ${plural(years, ["год", "года", "лет"])}`,
        nationality: "Национальность:",
        alsoKnownAs: "Также известен как:",
        performsAs: "Выступает как:",
        placeOfBirth: "Место рождения:",
        occupation: "Занятия:",
        instruments: "Инструменты:",
        soloDebut: "Сольный дебют:",
        height: "Рост:",
        weight: "Вес:",
        agency: "Агентство:",
        agencies: "Агентства:",
        members: "Участники",
        brands: "Личные бренды",
        mascotOf: "Чей маскот",
        pairedWith: "В паре с",
        pastPairings: "Бывшие пары",
        mascots: "Маскоты",
        band: "Группа",
        events: "События",
        upcoming: (n: number) => `Предстоящие (${n})`,
        past: (n: number) => `Прошедшие (${n})`,
        noPast: "Прошедших событий нет.",
        noUpcoming: "Нет предстоящих событий.",
        series: "Сериалы",
        movies: "Фильмы",
        shows: "Шоу",
        albums: "Альбомы",
        songs: "Песни и синглы",
        mvAppearances: "Появления в клипах",
        awards: "Награды и номинации",
        trivia: "Факты",
    },

    novels: {
        metaTitle: "Новеллы",
        metaDescription:
            "Новеллы, по которым сняты сериалы: авторы, описания и экранизации.",
        title: "Новеллы",
        search: "Поиск по названию или автору…",
        empty: "Новеллы скоро появятся.",
    },

    novel: {
        metaTitle: "Новелла",
        metaNotFound: "Новелла не найдена.",
        metaDescription: (name: string) => `${name}: описание новеллы и её экранизации.`,
        back: "← Все новеллы",
        adaptationCount: (n: number) => `экранизаций: ${n}`,
        originalAuthor: "Автор оригинала:",
        size: "Размер:",
        whereToRead: "Где почитать",
        adaptations: "Экранизации",
    },

    agency: {
        metaTitle: "Агентство",
        metaNotFound: "Агентство не найдено.",
        metaDescription: (name: string) =>
            `${name}: артисты агентства, их сериалы и события на MyBLHub.`,
        back: "← Все агентства",
        artistCount: (n: number) => `артистов: ${n}`,
        seriesCount: (n: number) => `сериалов: ${n}`,
        tabArtists: (n: number) => `Артисты (${n})`,
        tabSeries: (n: number) => `Сериалы (${n})`,
        noArtistsFound: "Никого не нашлось.",
        emptyArtists: "Пока нет артистов.",
        emptySeries: "Пока нет сериалов.",
    },

    locations: {
        metaTitle: "Локации съёмок",
        metaDescription:
            "Места съёмок сериалов: адреса, карта и сериалы, которые там снимали.",
        title: "Локации",
        onMap: "На карте",
        myPlacesLink: "Мои места и списки →",
        tabAlphabet: "По алфавиту",
        tabByDrama: "По сериалам",
        tabAllMine: (n: number) => `Все мои места (${n})`,
        empty: "Пока нет локаций.",
        emptyTitle: "Локаций пока нет",
        emptyHint: "Мы добавляем места съёмок постепенно — загляните позже.",
        noSeries: "Без сериала",
        listNotFound: "Список не найден.",
        openWholeList: "Открыть список целиком →",
        emptyList: "В этом списке пока нет мест.",
        myPlacesHintBefore: "Места, которые вы добавили сами. Новое место заводится в разделе ",
        myPlacesHintLink: "«Мои места»",
        myPlacesHintAfter: " — список для этого не нужен.",
        emptyMine: "Своих мест пока нет.",
    },

    location: {
        metaTitle: "Локация",
        metaNotFound: "Локация не найдена.",
        metaDescription: (name: string) =>
            `${name}: место съёмок сериалов — как добраться и что здесь снимали.`,
        back: "← Все локации",
        filmedHere: (n: number) => `сериалов снималось: ${n}`,
        series: "Сериалы",
        eventsHere: "События здесь",
        onMap: "На карте",
        nearby: "Другие места этих съёмок",
    },

    map: {
        metaTitle: "Карта локаций",
        metaDescription:
            "Карта мест съёмок сериалов: где снимали, что рядом и как добраться.",
        title: "Карта локаций",
        back: "← Все локации",
    },
};
