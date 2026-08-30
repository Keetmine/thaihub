import { plural, pluralized } from "@/lib/plural";
import type { Dict } from "../en";

export const account: Dict["account"] = {
  eyebrow: "Аккаунт",
  metaTitle: "Профиль",
  metaDescription:
    "Личный кабинет: избранные артисты, ближайшие события, статусы просмотра, ачивки и подписка.",

  tabProfile: "Профиль",
  tabEvents: "События",
  tabTickets: (n: number) => `Билеты (${n})`,

  planPremium: "Подписка",
  planFree: "Базовый",
  telegramSignIn: "Вход через Telegram",
  memberSince: (date: string) => `На MyBLHub с ${date}`,
  settingsLink: "Настройки",
  logout: "Выйти",

  events: {
    locked: "🔒 Списки событий доступны по подписке.",
    upcoming: "Мои события — предстоящие",
    past: "Мои события — прошедшие",
    favorites: "Избранные события",
    emptyTitle: "Пока пусто",
    emptyHint:
      "Отмечайте «иду» на событиях и добавляйте их в избранное — они появятся здесь.",
    emptyCta: "Посмотреть афишу",
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
    heroDays: (n: number) => `${plural(n, ["день", "дня", "дней"])} в Таиланде`,
    heroDaysHint: "по поездкам",
    heroDramas: (n: number) => `${plural(n, ["сериал", "сериала", "сериалов"])} досмотрено`,
    heroDramasHint: "статус «просмотрено»",
    heroDramasEpisodes: (episodes: number, hours: number) =>
      `${pluralized(episodes, ["серия", "серии", "серий"])} · ~${hours} ч`,

    chipGoing: "иду",
    chipFavoriteEvents: "в избранном",
    chipPerformers: (n: number) =>
      plural(n, ["любимый артист", "любимых артиста", "любимых артистов"]),
    chipDramas: (n: number) => `${plural(n, ["сериал", "сериала", "сериалов"])} в списке`,
    chipFriends: (n: number) => plural(n, ["друг", "друга", "друзей"]),
    chipTrips: (n: number) => plural(n, ["поездка", "поездки", "поездок"]),
    chipVenues: (n: number) => plural(n, ["площадка", "площадки", "площадок"]),
    chipLocations: (n: number) => `${plural(n, ["локация", "локации", "локаций"])} съёмок`,

    lockedTitle: "Личная статистика — по подписке",
    lockedDescription:
      "Сколько событий и артистов вы застали вживую, дни в Таиланде, карта посещённого и ачивки.",
  },

  stats: {
    topPerformers: "Чаще всего видела вживую",

    artistLists: "Мои списки актёров",
    artistListsHint: "Создайте свой список — «видела вживую», «пили пиво»…",
    artistListsLocked: "Свои списки актёров — по подписке.",
    artistListsLockedCta: "Оформить",
    listEmpty: "пока пусто",
    listCount: (n: number) => `${n} ${plural(n, ["артист", "артиста", "артистов"])}`,

    byYear: "События по годам",
    visitedMap: "Карта посещённого",

    achievements: "Ачивки",
    achievementsProgress: (unlocked: number, total: number) => `${unlocked} из ${total}`,
    achievementsSecret: " — остальные пока секрет 😉",
    achievementsEmpty: "Пока ни одной — первая ждёт на первом же событии.",
    achievementsLockedTitle: "Ачивки — по подписке",
    achievementsLockedDescription: (total: number) =>
      `Достижения за концерты, поездки и просмотренные сериалы (сейчас их ${total}) — какие именно, узнаете, когда получите.`,
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
    bioPlaceholder: "Любимые актёры и сериалы, на скольких концертах были",
    save: "Сохранить",

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
    telegramNotifyEvents: "Друзья идут на события",
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
    privacyHideAchievements: "Скрыть ачивки",
    privacyHideFavorites: "Скрыть фан-профиль (любимых актёров)",
    privacyHideVisited: "Скрыть посещённые места",

    currentPassword: "Текущий пароль",
    newPassword: "Новый пароль",
    repeatPassword: "Повторите новый пароль",
    passwordChanged: "Пароль изменён.",
    passwordSaving: "Сохранение…",
    passwordSubmit: "Сменить пароль",
    passwordFailed: "Не удалось изменить пароль — попробуйте ещё раз",
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
