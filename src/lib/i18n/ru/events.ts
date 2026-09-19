import type { Dict } from "../en";
import { plural, pluralized } from "@/lib/plural";

export const events: Dict["events"] = {
  list: {
    metaTitle: "Афиша",
    metaDescription:
      "Афиша концертов, фанмитов и других событий актёров: даты, площадки, составы.",
    eyebrow: "События",
    title: "Афиша",
    paywallFeature: "Афиша событий",
    openCalendar: "Посмотреть в календаре",
    tabAll: "Все",
    tabGoing: "Я иду",
    tabFavorites: "Избранное",
    tabArtists: "Мои артисты",
    tabCommunities: "Сообщества",
    searchPlaceholder: "Поиск по названию…",
    rangeEmpty: "В этом диапазоне дат событий нет.",
    rangeCount: (count: number) => `Событий в диапазоне: ${count}.`,
    emptyUpcoming: "Предстоящих событий пока нет.",
    archiveHeading: "Архив событий",
    teaserHeading: "Ближайшее",
  },

  calendar: {
    metaTitle: "Календарь событий",
    metaDescription:
      "Календарь концертов и фанмитов актёров, включая дни рождения и даты выхода серий.",
    backToEvents: "← Все события",
    /** «Назад» из календаря, когда пришли из каталога сериалов
     *  (правка владельца 2026-09-16: из каталога ссылка уводила в
     *  афишу — не туда, откуда пришли). */
    backToCatalog: "← Каталог",
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
    episodeTitle: (
      drama: string,
      number: number,
      episodeTitle: string | null,
    ) => `${drama} — ${number} серия${episodeTitle ? `: ${episodeTitle}` : ""}`,
    seriesEmptyTitle: "В этом месяце серий нет",
    seriesEmptyHint:
      "Ни у одного сериала на этот месяц дата выхода пока не объявлена.",
    seriesEmptyCta: "Смотреть сериалы",
  },

  day: {
    metaTitle: (date: string) => `События ${date}`,
    metaDescription: (date: string) =>
      `Концерты и фанмиты актёров ${date}: расписание дня.`,
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
    paywallFeature: "Планы, билеты и напоминания",
    premiumIntro:
      "Всё о самом событии — выше и открыто всем. Подписка добавляет ваши планы вокруг него: отметить даты, куда идёте, держать под рукой билеты, видеть, кто из друзей идёт, и получить напоминание до старта продаж.",
    addToCalendar: "Добавить в календарь",
    tickets: "Билеты",
    venue: "Площадка:",
    openOnMap: "Открыть на карте",
    organizer: "Организатор:",
    tags: "Теги:",
    dateAndTime: "Дата и время:",
    ticketPrice: "Цена билетов:",
    presale: "Препродажа билетов:",
    presaleTba: "уточняется",
    series: "Сериал:",
    lineup: "Кто выступает",
    lineupByDay: "Лайнап по дням",
    /** Заявленные на фестиваль, но не попавшие ни в один день
     *  расписания: без этого блока их на странице не было вовсе. */
    castWithoutDay: "Ещё в составе",
    castWithoutDayHint: "Заявлены на событие, но в расписании по дням их пока нет.",
    /** Сколько выступлений в этот день фестиваля. */
    performances: (n: number) =>
      pluralized(n, ["выступление", "выступления", "выступлений"]),
    description: "Описание",
    photoFullSize: "Открыть в полном размере",
    friendGoing: "Друг идёт",
    friendsGoing: "Друзья идут",
    // Прошедшее событие — прошедшее время (правка владельца 2026-09-17).
    friendWent: "Друг побывал(а)",
    friendsWent: "Друзья побывали",
    unnamedFriend: "Без имени",
    /** «Идут с сайта» — витрина живых людей на событии, видна и гостю. */
    siteGoing: "Идут с сайта",
    /** Подсказка на кружке «+N», когда идущих больше десяти. */
    siteGoingMore: (n: number) =>
      `и ещё ${pluralized(n, ["человек", "человека", "человек"])}`,
  },

  /** Ответы серверных экшенов вокруг события (избранное, отзывы,
   *  комментарии). Тот же текст, что у 404 самой страницы: посторонний
   *  не должен отличить «встречи нет» от «встреча есть, но не для вас». */
  errors: {
    notFound: "Событие не найдено",
  },

  going: {
    promptPast:
      "Были на этом событии? Отметьте даты — они попадут в вашу статистику:",
    promptFuture:
      "Пойдёте? Отметьте свои даты — они попадут в календарь и план поездки:",
    removePast: "Убрать отметку о посещении",
    removeFuture: "Убрать из моего плана",
    addPast: "Отметить, что были в этот день",
    addFuture: "Пойду в этот день",
    dateNotFound: "Дата события не найдена",
    premium: "Отметки «иду» — часть подписки",
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
    onlineBooking: {
      add: "+ Онлайн-бронирование",
      edit: "Изменить онлайн-бронирование",
      remove: "Убрать онлайн-бронирование",
      opensAt: (when: string) => `Онлайн-бронирование откроется ${when}`,
      linkOnly: "Онлайн-бронирование",
      open: "Открыть",
      date: "Дата",
      time: "Время",
      url: "Ссылка (необязательно)",
      save: "Сохранить",
      cancel: "Отмена",
      reminderHint:
        "Напомним за час до открытия — в колокольчике и в Telegram.",
      needDateTime: "Укажите и дату, и время",
      badUrl: "Ссылка должна начинаться с http:// или https://",
    },
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
    // Бейдж онлайн-встречи сообщества — встаёт на место площадки
    // (venue у такой встречи пустой); см. комментарий в en/events.ts.
    online: "Онлайн",
    friend: "Друг",
    oneFriendGoing: (name: string) => `${name} идёт`,
    manyFriendsGoing: (count: number) =>
      `${pluralized(count, ["друг", "друга", "друзей"])} ${plural(count, ["идёт", "идут", "идут"])}`,
    // Прошедшая дата — прошедшее время (правка владельца 2026-09-17).
    oneFriendWent: (name: string) => `${name} побывал(а)`,
    manyFriendsWent: (count: number) =>
      `${pluralized(count, ["друг", "друга", "друзей"])} ${plural(count, ["побывал(а)", "побывали", "побывали"])}`,
    extraDates: (count: number) =>
      `+${count} ${plural(count, ["дата", "даты", "дат"])}`,
    // Подсказка на чипе сообщества у названия встречи: сам чип
    // показывает только название, а «встреча сообщества» —
    // расшифровка, зачем оно там (см. .event-row-community).
    communityMeetup: (name: string) => `Встреча сообщества «${name}»`,
    lockedAria: "Событие доступно по подписке",
    lockedBadge: "По подписке",
    // Закрытая встреча сообщества для постороннего: гейт — членство, а
    // не подписка, и афишное «По подписке» тут врало бы (аудит 2026-09).
    lockedMembersAria: "Встреча видна только участникам сообщества",
    lockedBadgeMembers: "Для участников сообщества",
    thaiTime: (zone: string, time: string) => `Тайское время. ${zone}: ${time}`,
    /** Встреча в своей зоне (не тайской): «Время по Минску. МСК: 18:10». */
    zoneTime: (eventZone: string, zone: string, time: string) =>
      `Время: ${eventZone}. ${zone}: ${time}`,
    zoneTimeSame: (eventZone: string) => `Время: ${eventZone}`,
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
    hint: "Введите название события, артиста, сериала, локации или агентства.",
    nothingFound: (query: string) => `Ничего не найдено по запросу «${query}».`,
    sectionEvents: "События",
    sectionArtists: "Артисты",
    sectionSeries: "Сериалы",
    sectionLocations: "Локации",
    sectionAgencies: "Агентства",
    missingSomething:
      "Не нашли сериал или актёра, которого искали? Напишите нам — добавим.",
    writeToUs: "Написать нам",
  },
};
