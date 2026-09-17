import { plural, pluralized } from "@/lib/plural";
import type { Dict } from "../en";

export const account: Dict["account"] = {
  // Подписка на профиле — иконкой (правка владельца), текст живёт в
  // подсказке title/aria-label.
  planPremiumHint: "Действующая подписка",
  planLifetimeHint: "Бессрочная подписка",
  planFree: "Базовый",
  settingsLink: "Настройки",
  logout: "Выйти",

  events: {
    locked: "🔒 Списки событий доступны по подписке.",
    // Под-табы вкладки «События» профиля (pill-чипы, счётчик рядом).
    tabUpcoming: "Предстоящие",
    tabPast: "Прошедшие",
    tabFavorites: "Избранное",
    emptyTitle: "Пока пусто",
    emptyHint:
      "Отмечайте «иду» на событиях и добавляйте их в избранное — они появятся здесь.",
    emptyCta: "Посмотреть афишу",
  },

  // Вкладка «Отзывы»: все отзывы пользователя по сериалам, новеллам и
  // событиям — правка на странице самой записи, вкладка только показывает.
  reviews: {
    emptyTitle: "Отзывов пока нет",
    emptyHint:
      "Оцените сериал, новеллу или событие на его странице — ваши отзывы соберутся здесь.",
    emptyCta: "Посмотреть сериалы",
  },

  tickets: {
    emptyTitle: "Загруженных билетов пока нет",
    emptyHint:
      "Прикрепите файл на странице события — там же, где отмечаете «иду», — и он будет ждать вас здесь.",
    upcoming: "Ближайшие",
    past: "Прошедшие",
    open: "Открыть билет ↗",
  },

  overview: {
    heroEvents: (n: number) => `${plural(n, ["событие", "события", "событий"])} вживую`,
    heroEventsHint: "посещено",
    heroArtists: (n: number) => `${plural(n, ["артист", "артиста", "артистов"])} вживую`,
    heroArtistsHint: "увидели лично",
    // «В поездках», а не «в Таиланде» (правка владельца 2026-09-17):
    // поездку через сервис можно планировать в любую страну.
    heroDays: (n: number) => `${plural(n, ["день", "дня", "дней"])} в поездках`,
    heroDramas: (n: number) => `${plural(n, ["сериал", "сериала", "сериалов"])} досмотрено`,
    heroDramasHint: "статус «просмотрено»",
    heroDramasEpisodes: (episodes: number, hours: number) =>
      `${pluralized(episodes, ["серия", "серии", "серий"])} · ~${hours} ч`,
    heroRewatches: (n: number) => plural(n, ["пересмотр", "пересмотра", "пересмотров"]),
    heroRewatchesHint: "сериалы, которые смотрели не раз",
    heroRewatchesTop: (title: string, count: number) =>
      `Чаще всего пересматриваю: ${title} ×${count}`,

    chipGoing: "иду",
    chipFavoriteEvents: "в избранном",
    chipPerformers: (n: number) =>
      plural(n, ["любимый артист", "любимых артиста", "любимых артистов"]),
    chipDramas: (n: number) => `${plural(n, ["сериал", "сериала", "сериалов"])} в списке`,
    chipFriends: (n: number) => plural(n, ["друг", "друга", "друзей"]),
    chipTrips: (n: number) => plural(n, ["поездка", "поездки", "поездок"]),
    chipLocations: (n: number) => `${plural(n, ["локация", "локации", "локаций"])} съёмок`,

    lockedTitle: "Личная статистика — по подписке",
    lockedDescription:
      "Сколько событий и артистов вы застали вживую, дни в поездках, карта посещённого и достижения.",
  },

  stats: {
    topPerformers: "Чаще всего видела вживую",


    artistLists: "Мои списки артистов",
    artistListsHint: "Создайте свой список — «видела вживую», «пили пиво»…",
    artistListsLocked: "Свои списки артистов — по подписке.",

    liveTitle: "Вживую",
    calendarTitle: "Календарь событий",
    yearTotal: (n: number) => pluralized(n, ["событие", "события", "событий"]),
    artistsCount: (n: number) => pluralized(n, ["артист", "артиста", "артистов"]),
    monthTitle: (month: string, year: number, n: number) =>
      `${month} ${year}: ${pluralized(n, ["событие", "события", "событий"])}`,
    seriesTitle: "Сериалы",
    episodesFigure: (hours: number) => `серий · около ${hours} ч`,
    tripsTitle: "Поездки",
    tripsFigure: (n: number) => plural(n, ["поездка", "поездки", "поездок"]),
    tripDays: (n: number) => pluralized(n, ["день", "дня", "дней"]),
    libraryLead: (n: number) => `${pluralized(n, ["сериал", "сериала", "сериалов"])} в библиотеке`,
    episodesHours: (episodes: number, hours: number) =>
      `${pluralized(episodes, ["серия", "серии", "серий"])} · около ${hours} ч у экрана`,
    genresLead: "Чаще всего досматривали",
    visitedMap: "Карта посещённого",
    // На чужом профиле — без обращения к владельцу.
    visitedMapViewer: "Карта посещённых мест",
    visitedCount: (n: number) => pluralized(n, ["место", "места", "мест"]),

    achievements: "Достижения",
    // achievementsSecret удалён — правка владельца: строки про «секрет»
    // на профиле больше нет.
  },

  settings: {
    metaTitle: "Настройки",
    metaDescription:
      "Ник и фото, часовой пояс, кто видит профиль, уведомления в Telegram, подписка на календарь и удаление аккаунта.",
    back: "← Профиль",
    title: "Настройки",

    tabProfile: "Профиль",
    tabPrivacy: "Приватность",
    tabSecurity: "Безопасность",
    tabCalendar: "Календарь",

    username: "Ник",
    usernameHint:
      "Латиница, цифры, точка, дефис или подчёркивание. Занятый ник не сохранится — прежний останется.",
    name: "Имя",
    timezone: "Таймзона",
    language: "Язык",
    languageHint: "Действует на сайт, уведомления и календарную подписку.",
    languageNames: { en: "English", ru: "Русский" },
    timezoneHint: "Время событий показывается тайское, а в скобках — в этой зоне.",
    country: "Страна",
    countryEmpty: "не указана",
    nameVisible: "Имя видно друзьям и в публичном профиле.",
    photo: "Фото",
    gender: "Пол",
    genderEmpty: "не указан",
    genderFemale: "женский",
    genderMale: "мужской",
    genderOther: "другой",
    birthDate: "Дата рождения",
    bio: "О себе",
    bioPlaceholder: "Любимые артисты и сериалы, на скольких концертах были",
    save: "Сохранить",

    exportTitle: "Выгрузка данных",
    exportHint: "Заберите свои данные таблицей — файл открывается в Excel и Google Таблицах. По файлу на раздел.",
    exportDramas: "Сериалы",
    exportEvents: "События",
    exportTrips: "Поездки",
    exportTripItems: "Записи поездок",
    exportArtists: "Артисты",
    exportPlaces: "Места",
    tourTitle: "Тур по сайту",
    tourHint: "Короткая проводка по разделам — где афиша, поездки и уведомления.",
    tourRestart: "Пройти заново",
    tourStart: "Начать тур",

    telegram: "Telegram",
    telegramLinked: "Telegram подключён.",
    telegramTaken: "Этот Telegram уже привязан к другому аккаунту.",
    telegramOnlyLogin:
      "Это ваш единственный способ входа — сначала задайте пароль во вкладке «Безопасность».",
    telegramConnected: (handle: string) =>
      `Подключён${handle ? ` — @${handle}` : ""}. Присылаем напоминания о событиях и новости друзей.`,
    telegramUnlink: "Отвязать",
    telegramUnlinking: "Отвязываем…",
    telegramUnlinkConfirm:
      "Отвязать Telegram? Напоминания о событиях и новости друзей приходить перестанут. Подключить обратно можно в любой момент.",
    telegramSendTitle: "Присылать в Telegram:",
    telegramNotifyInvites: "Приглашения в поездки и подписка",
    telegramNotifyFriends: "Заявки в друзья",
    telegramNotifyReplies: "Ответы на мои комментарии",
    telegramNotifyEvents: "События: новое у избранного артиста, друзья идут, открытие онлайн-бронирования",
    telegramNotifyBirthdays: "Дни рождения избранных артистов",
    telegramNotifyEpisodes: "Новые серии сериалов, которые смотрю",
    telegramNotifyBroadcast: "Новости проекта",
    telegramConnectHint:
      "Подключите, чтобы получать напоминания о событиях, старте продаж билетов и новостях друзей.",
    telegramLinking: "Привязываем…",
    telegramSessionExpired: "Сессия истекла — войдите заново.",
    telegramNotConfirmed: "Telegram не подтвердил вход. Попробуйте ещё раз.",
    telegramServerError: "Не удалось связаться с сервером. Попробуйте ещё раз.",

    relinkTitle: "Перенести Telegram на этот аккаунт?",
    relinkIntro: (handle: string, otherName: string) =>
      `Telegram${handle ? ` @${handle}` : ""} уже привязан к другому аккаунту${
        otherName ? ` — «${otherName}»` : ""
      }. Один Telegram может принадлежать только одному аккаунту.`,
    relinkWhat: "Что произойдёт",
    relinkLinks: "Telegram привяжется к аккаунту, в котором вы сейчас.",
    relinkDeletes: "Старый аккаунт будет удалён — войти в него больше не получится.",
    relinkLosses: (losses: string) => `Вместе с ним пропадут: ${losses}.`,
    relinkLostPerformers: (n: number) =>
      pluralized(n, ["любимый артист", "любимых артиста", "любимых артистов"]),
    relinkLostEvents: (n: number) =>
      pluralized(n, ["событие в избранном", "события в избранном", "событий в избранном"]),
    relinkLostAttendances: (n: number) =>
      pluralized(n, ["отметка «иду»", "отметки «иду»", "отметок «иду»"]),
    relinkLostTrips: (n: number) => pluralized(n, ["поездка", "поездки", "поездок"]),
    relinkNoLosses: "Данных в нём нет — терять нечего.",
    relinkConfirm: "Перенести и удалить старый",
    relinkBusy: "Переносим…",
    relinkExpired: "Данные Telegram устарели — нажмите кнопку ещё раз.",

    privacyIntro: "Друзья видят всё всегда; настройки ниже — для остальных.",
    privacyHideActivity: "Скрыть всю активность",
    privacyHideActivityHint: "Не-друзья увидят только имя и фото.",
    privacyHideAchievements: "Скрыть достижения",
    privacyHideFavorites: "Скрыть фан-профиль (любимых артистов)",
    privacyHideVisited: "Скрыть посещённые места",

    currentPassword: "Текущий пароль",
    newPassword: "Новый пароль",
    repeatPassword: "Повторите новый пароль",
    passwordChanged: "Пароль изменён.",
    passwordSaving: "Сохранение…",
    passwordSubmit: "Сменить пароль",
    passwordFailed: "Не удалось изменить пароль — попробуйте ещё раз",
    /** Подделанный адрес фото (см. src/lib/uploadUrl.ts) — молча не
     *  сохраняем и говорим почему. */
    badPhotoUrl: "Фото сохранить не вышло — загрузите картинку заново",
    passwordNoAccount: "Аккаунт создан через Telegram — пароля у него нет",
    passwordWrongCurrent: "Неверный текущий пароль",
    passwordTooShort: "Новый пароль должен быть не короче 6 символов",
    passwordMismatch: "Пароли не совпадают",

    deleteTitle: "Удаление аккаунта",
    deleteText:
      "Аккаунт будет удалён: почта и привязки освободятся, профиль обезличится. Восстановить его нельзя. Комментарии и отзывы останутся подписанными «Удалённый аккаунт».",
    deleteConfirm: "Удалить аккаунт навсегда? Это действие нельзя отменить.",
    deleteLabel: "Удалить навсегда",
    deleteBusy: "Удаляем…",
    deleteButton: "Удалить аккаунт",

    icsHint:
      "Подпишитесь на эту ссылку в календаре телефона (Google Calendar, Apple Calendar) — события, на которые вы отметили «Иду», будут появляться там сами.",
    icsAria: "Ссылка на календарь",
    icsCopy: "Копировать",
    icsCopied: "Скопировано",
    icsRegenerate: "Обновить ссылку",
    icsRegenerating: "Обновление…",
    icsRegenerateConfirm: "Старая ссылка перестанет работать. Обновить?",
  },

  /** Предложение привязать Telegram тем, кто зарегистрировался
   *  почтой (правка владельца 2026-09-06). */
  telegramPrompt: {
    title: "Уведомления в Telegram",
    intro: "Подключите Telegram — и не пропустите:",
    pointEpisodes: "новые серии сериалов, которые вы смотрите",
    pointFriends: "заявки в друзья и приглашения в поездки",
    pointPresale: "старт продажи билетов на ваши события",
    privacy: "Что присылать — настраивается в профиле; отключить можно в любой момент.",
    later: "Не сейчас",
    linkFailed: "Не получилось подключить — попробуйте из настроек профиля",
  },
  notifications: {
    metaTitle: "Уведомления",
    metaDescription: "Приглашения в поездки, заявки в друзья и ответы на комментарии.",
    eyebrow: "Личное",
    title: "Уведомления",
    markAllRead: (n: number) => `Отметить прочитанными (${n})`,
    emptyTitle: "Пока пусто",
    emptyHint:
      "Здесь появятся приглашения в поездки, заявки в друзья и ответы на ваши комментарии.",
  },
};
