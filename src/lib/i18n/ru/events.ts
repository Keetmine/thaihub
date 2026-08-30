import type { Dict } from "../en";
import { plural, pluralized } from "@/lib/plural";

export const events: Dict["events"] = {
    list: {
        metaTitle: "Афиша",
        metaDescription:
            "Афиша концертов, фанмитов и других событий тайских актёров: даты, площадки, составы.",
        eyebrow: "События",
        title: "Афиша",
        paywallFeature: "Афиша событий",
        openCalendar: "Посмотреть в календаре",
        tabAll: "Все",
        tabGoing: "Я иду",
        tabFavorites: "Избранное",
        tabArtists: "Мои артисты",
        searchPlaceholder: "Поиск по названию…",
        rangeEmpty: "В этом диапазоне дат событий нет.",
        rangeCount: (count: number) => `Событий в диапазоне: ${count}.`,
        emptyUpcoming: "Предстоящих событий пока нет.",
        archiveHeading: "Архив событий",
    },

    calendar: {
        metaTitle: "Календарь событий",
        metaDescription:
            "Календарь концертов и фанмитов тайских актёров, включая дни рождения и даты выхода серий.",
        backToEvents: "← Все события",
        title: "Календарь",
        paywallFeature: "Календарь",
        prev: "← Пред.",
        today: "Сегодня",
        next: "След. →",
        viewAll: "Все события",
        viewMine: "Мои события",
        viewBirthdays: "Дни рождения",
        viewSeries: "Сериалы",
        birthdayTitle: (name: string, age: number) =>
            `${name} — ${age} ${plural(age, ["год", "года", "лет"])}`,
        more: (count: number) => `+${count} ещё`,
        monthSelect: "Месяц",
        yearSelect: "Год",
        // И11: фильтр на вкладке сериалов — «любой статус просмотра».
        seriesFilterAll: "Все сериалы",
        seriesFilterMine: "Только мои",
        episodeShort: (number: number) => `${number} серия`,
        episodeTitle: (drama: string, number: number, episodeTitle: string | null) =>
            `${drama} — ${number} серия${episodeTitle ? `: ${episodeTitle}` : ""}`,
        seriesEmptyTitle: "В этом месяце серий нет",
        seriesEmptyHint: "Ни у одного сериала на этот месяц дата выхода пока не объявлена.",
        seriesEmptyCta: "Смотреть сериалы",
    },

    day: {
        metaTitle: (date: string) => `События ${date}`,
        metaDescription: (date: string) =>
            `Концерты и фанмиты тайских актёров ${date}: расписание дня.`,
        metaTitleUnknown: "События дня",
        metaDescriptionUnknown: "Страница не найдена.",
        backToCalendar: "← К календарю",
        prevDay: "← Пред. день",
        nextDay: "След. день →",
        empty: "На этот день ничего не запланировано.",
        eventsHeading: "События",
        seriesHeading: "Серии",
    },

    detail: {
        metaTitleUnknown: "Событие",
        metaDescriptionUnknown: "Событие не найдено.",
        metaDescription: (title: string, when: string | null, venue: string) =>
            `${title}${when ? `, ${when}` : ""} — ${venue}. Билеты, состав и детали события.`,
        backToEvents: "← Все события",
        lockedTitle: "Событие",
        paywallFeature: "Страницы событий",
        addToCalendar: "Добавить в календарь",
        tickets: "Билеты",
        venue: "Площадка:",
        dateAndTime: "Дата и время:",
        ticketPrice: "Цена билетов:",
        presale: "Препродажа билетов:",
        presaleTba: "уточняется",
        series: "Сериал:",
        lineup: "Кто выступает",
        lineupByDay: "Лайнап по дням",
        description: "Описание",
        photoFullSize: "Открыть в полном размере",
        friendGoing: "Друг идёт",
        friendsGoing: "Друзья идут",
        unnamedFriend: "Без имени",
    },

    going: {
        promptPast: "Были на этом событии? Отметьте даты — они попадут в вашу статистику:",
        promptFuture: "Пойдёте? Отметьте свои даты — они попадут в календарь и план поездки:",
        removePast: "Убрать отметку о посещении",
        removeFuture: "Убрать из моего плана",
        addPast: "Отметить, что были в этот день",
        addFuture: "Пойду в этот день",
        dateNotFound: "Дата события не найдена",
    },

    tickets: {
        heading: "Мои билеты",
        open: "Открыть билет",
        detach: "Открепить билет",
        uploading: "Загрузка…",
        attach: "+ Прикрепить билет (PDF или фото)",
        uploadFailed: "Не удалось загрузить",
        uploadFailedLong: "Не удалось загрузить билет",
        badFile: "Файл билета не прошёл проверку — загрузите его ещё раз",
        goFirst: "Сначала отметьте «иду» на эту дату",
    },

    // Ошибки маршрута и подписи внутри самого файла .ics —
    // человек видит их уже в своём календаре.
    ics: {
        subscriptionOnly: "Доступно по подписке",
        notFound: "Событие не найдено",
        noPresale: "Препродажа не указана",
        calendarName: "MyBLHub — мои события",
        presale: (title: string) => `Препродажа: ${title}`,
    },

    notes: {
        heading: "Заметки",
        add: "+ Добавить заметку",
        placeholder: "Например: берём мерч на входе, встречаемся у гейта 3…",
        ariaLabel: "Заметка к событию",
        visPersonal: "Личная",
        visFriends: "Видна друзьям",
        visTrip: "Участникам моих поездок",
        emptyDeletes: "Пустой текст удаляет заметку.",
        markPersonal: "личная",
        markFriends: "видна друзьям",
        markTrip: "видна участникам поездок",
        empty: "Пока нет заметок — добавьте первую: что взять, где встречаемся.",
        friend: "Друг",
    },

    card: {
        myTicket: "Мой билет",
        friend: "Друг",
        oneFriendGoing: (name: string) => `${name} идёт`,
        manyFriendsGoing: (count: number) =>
            `${pluralized(count, ["друг", "друга", "друзей"])} ${plural(count, ["идёт", "идут", "идут"])}`,
        extraDates: (count: number) => `+${count} ${plural(count, ["дата", "даты", "дат"])}`,
        lockedAria: "Событие доступно по подписке",
        lockedBadge: "По подписке",
        thaiTime: (zone: string, time: string) => `Тайское время. ${zone}: ${time}`,
    },

    filter: {
        range: (from: string, to: string) => `Диапазон: ${from} – ${to}`,
        button: "Фильтр по датам",
        from: "С даты",
        to: "По дату",
        apply: "Показать",
        reset: "Сбросить",
    },

    search: {
        metaTitle: "Поиск",
        metaDescription:
            "Одно поле на весь каталог: артисты и группы, сериалы, новеллы, события афиши и места съёмок — ищем сразу везде.",
        eyebrow: "Поиск",
        title: "Поиск",
        placeholder: "Событие, артист, сериал, локация…",
        ariaLabel: "Поисковый запрос",
        youSearched: (query: string) => `Вы искали «${query}» — вот что нашлось по каталогу:`,
        hint: "Введите название события, артиста, сериала, локации или агентства.",
        nothingFound: (query: string) => `Ничего не найдено по запросу «${query}».`,
        sectionEvents: "События",
        sectionArtists: "Артисты",
        sectionSeries: "Сериалы",
        sectionLocations: "Локации",
        sectionAgencies: "Агентства",
        missingSomething: "Не нашли сериал или актёра, которого искали? Напишите нам — добавим.",
        writeToUs: "Написать нам",
    },
};
