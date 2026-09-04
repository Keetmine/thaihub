/**
 * Личный кабинет: обзор профиля, статистика, билеты, настройки и лента
 * уведомлений. Названия и описания ачивок сюда не попадают — они лежат
 * в базе (модель Achievement) и правятся из админки.
 */
// Ключи шапки и вкладок старого кабинета (eyebrow, metaTitle, tab*)
// удалены: /account теперь permanent redirect на единую страницу
// профиля, её вкладки живут в social.profile.tabs.
export const account = {
  // Подписка на профиле — иконкой (правка владельца), текст живёт в
  // подсказке title/aria-label.
  planPremiumHint: "Active subscription",
  planFree: "Free",
  telegramSignIn: "Signed in with Telegram",
  memberSince: (date: string) => `On MyBLHub since ${date}`,
  settingsLink: "Settings",
  logout: "Log out",

  events: {
    locked: "🔒 Event lists come with a subscription.",
    // Под-табы вкладки «События» профиля (pill-чипы, счётчик рядом).
    tabUpcoming: "Upcoming",
    tabPast: "Past",
    tabFavorites: "Favourites",
    emptyTitle: "Nothing here yet",
    emptyHint:
      "Mark yourself as going to events and add them to your favourites — they will show up here.",
    emptyCta: "Browse the schedule",
  },

  // Вкладка «Отзывы»: все отзывы пользователя по сериалам, новеллам и
  // событиям — правка на странице самой записи, вкладка только показывает.
  reviews: {
    emptyTitle: "No reviews yet",
    emptyHint:
      "Rate a series, novel or event on its page — your reviews will be collected here.",
    emptyCta: "Browse the series",
  },

  tickets: {
    emptyTitle: "No tickets uploaded yet",
    emptyHint:
      "Attach a file on the event page — right where you mark yourself as going — and it will be waiting for you here.",
    upcoming: "Upcoming",
    past: "Past",
    open: "Open ticket ↗",
  },

  // Обзор профиля: крупные «герои» сверху и чипы-ссылки под ними.
  overview: {
    heroEvents: (n: number) => `${n === 1 ? "event" : "events"} live`,
    heroEventsHint: "attended",
    heroArtists: (n: number) => `${n === 1 ? "artist" : "artists"} live`,
    heroArtistsHint: "seen in person",
    heroDays: (n: number) => `${n === 1 ? "day" : "days"} in Thailand`,
    heroDaysHint: "across your trips",
    // «series» не меняется по числу, но параметр обязан остаться: тип
    // функции задаёт en-словарь, а русскому переводу число нужно.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    heroDramas: (_n: number): string => "series finished",
    heroDramasHint: "marked as watched",
    // Серии и часы у экрана — подпись той же плитки, когда есть что считать.
    heroDramasEpisodes: (episodes: number, hours: number) =>
      `${episodes} ${episodes === 1 ? "episode" : "episodes"} · ~${hours} h`,

    chipGoing: "going",
    chipFavoriteEvents: "in favourites",
    chipPerformers: (n: number) => `favourite ${n === 1 ? "artist" : "artists"}`,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    chipDramas: (_n: number): string => "series on your list",
    // Возвращаемый тип задан явно: иначе TypeScript выводит union из двух
    // строковых литералов, и русский перевод в него не укладывается.
    chipFriends: (n: number): string => (n === 1 ? "friend" : "friends"),
    chipTrips: (n: number): string => (n === 1 ? "trip" : "trips"),
    // chipVenues удалён: площадки из статистики профиля убраны (правка
    // владельца).
    chipLocations: (n: number) => `filming ${n === 1 ? "location" : "locations"}`,

    lockedTitle: "Your own stats come with a subscription",
    lockedDescription:
      "How many events and artists you caught live, days spent in Thailand, a map of where you have been, and achievements.",
  },

  stats: {
    topPerformers: "Seen live most often",

    artistLists: "My actor lists",
    artistListsHint: "Start a list of your own — “seen live”, “had a beer with”…",
    artistListsLocked: "Your own actor lists come with a subscription.",
    artistListsLockedCta: "Subscribe",
    listEmpty: "empty for now",
    listCount: (n: number) => `${n} ${n === 1 ? "artist" : "artists"}`,

    byYear: "Events by year",
    visitedMap: "Map of where you've been",
    // На чужом профиле «вы» неуместно — своя подпись для зрителя.
    visitedMapViewer: "Map of visited places",

    achievements: "Achievements",
    achievementsProgress: (unlocked: number, total: number) => `${unlocked} of ${total}`,
    // achievementsSecret удалён — правка владельца: строки про «секрет»
    // на профиле больше нет.
    achievementsEmpty: "None yet — the first one is waiting at your first event.",
    achievementsLockedTitle: "Achievements come with a subscription",
    achievementsLockedDescription: (total: number) =>
      `Badges for concerts, trips and series you have finished (${total} of them so far) — which ones exactly, you find out as you earn them.`,
  },

  settings: {
    metaTitle: "Settings",
    metaDescription:
      "Name and photo, time zone, who can see your profile, Telegram notifications, calendar subscription and account deletion.",
    back: "← Profile",
    title: "Settings",

    tabProfile: "Profile",
    tabPrivacy: "Privacy",
    tabSecurity: "Security",
    tabCalendar: "Calendar",

    username: "Handle",
    usernameHint:
      "Latin letters, digits, a dot, a hyphen or an underscore. A handle that is already taken will not save — the old one stays.",
    name: "Name",
    timezone: "Time zone",
    language: "Language",
    languageHint: "Applies to the site, notifications and the calendar subscription.",
    languageNames: { en: "English", ru: "Русский" },
    timezoneHint: "Event times are shown in Thai time, with your zone in brackets.",
    country: "Country",
    countryEmpty: "not set",
    nameVisible: "Your name is visible to friends and on your public profile.",
    photo: "Photo",
    gender: "Gender",
    genderEmpty: "not set",
    genderFemale: "female",
    genderMale: "male",
    genderOther: "other",
    birthDate: "Date of birth",
    bio: "About you",
    bioPlaceholder: "Favourite actors and series, how many concerts you have been to",
    save: "Save",

    tourTitle: "Site tour",
    tourHint: "A quick walk through the sections — where the schedule, trips and notifications live.",
    tourRestart: "Take it again",
    tourStart: "Start the tour",

    telegram: "Telegram",
    telegramLinked: "Telegram connected.",
    telegramTaken: "This Telegram is already linked to another account.",
    telegramOnlyLogin:
      "This is your only way of signing in — set a password on the “Security” tab first.",
    telegramConnected: (handle: string) =>
      `Connected${handle ? ` — @${handle}` : ""}. We send event reminders and news from your friends.`,
    telegramUnlink: "Unlink",
    telegramUnlinking: "Unlinking…",
    telegramUnlinkConfirm:
      "Unlink Telegram? Event reminders and news from friends will stop arriving. You can connect it again at any time.",
    telegramSendTitle: "Send to Telegram:",
    telegramNotifyInvites: "Trip invitations and subscription",
    telegramNotifyFriends: "Friend requests",
    telegramNotifyReplies: "Replies to my comments",
    telegramNotifyEvents: "Friends going to events",
    telegramNotifyBirthdays: "Birthdays of artists I follow",
    telegramNotifyEpisodes: "New episodes of series I'm watching",
    telegramNotifyBroadcast: "Project news",
    telegramConnectHint:
      "Connect it to get reminders about events, ticket sales opening and news from your friends.",
    telegramLinking: "Linking…",
    telegramSessionExpired: "Your session has expired — sign in again.",
    telegramNotConfirmed: "Telegram did not confirm the sign-in. Please try again.",
    telegramServerError: "Couldn't reach the server. Please try again.",

    relinkTitle: "Move Telegram to this account?",
    relinkIntro: (handle: string, otherName: string) =>
      `Telegram${handle ? ` @${handle}` : ""} is already linked to another account${
        otherName ? ` — “${otherName}”` : ""
      }. One Telegram can belong to only one account.`,
    relinkWhat: "What will happen",
    relinkLinks: "Telegram will be linked to the account you are in right now.",
    relinkDeletes: "The old account will be deleted — signing into it will no longer be possible.",
    relinkLosses: (losses: string) => `Along with it you will lose: ${losses}.`,
    relinkLostPerformers: (n: number) => `${n} favourite ${n === 1 ? "actor" : "actors"}`,
    relinkLostEvents: (n: number) => `${n} saved ${n === 1 ? "event" : "events"}`,
    relinkLostAttendances: (n: number) => `${n} “going” ${n === 1 ? "mark" : "marks"}`,
    relinkLostTrips: (n: number) => `${n} ${n === 1 ? "trip" : "trips"}`,
    relinkNoLosses: "There is nothing in it — nothing to lose.",
    relinkConfirm: "Move it and delete the old one",
    relinkBusy: "Moving…",
    relinkExpired: "This Telegram data has expired — press the button again.",

    privacyIntro: "Friends always see everything; the settings below are for everyone else.",
    privacyHideActivity: "Hide all activity",
    privacyHideActivityHint: "Non-friends will only see your name and photo.",
    privacyHideAchievements: "Hide achievements",
    privacyHideFavorites: "Hide fan profile (favourite actors)",
    privacyHideVisited: "Hide visited places",

    currentPassword: "Current password",
    newPassword: "New password",
    repeatPassword: "Repeat the new password",
    passwordChanged: "Password changed.",
    passwordSaving: "Saving…",
    passwordSubmit: "Change password",
    passwordFailed: "Couldn't change the password — please try again",
    passwordNoAccount: "This account was created through Telegram — it has no password",
    passwordWrongCurrent: "Wrong current password",
    passwordTooShort: "The new password must be at least 6 characters long",
    passwordMismatch: "The passwords do not match",

    deleteTitle: "Deleting your account",
    deleteText:
      "The account will be deleted: the email and linked logins are released, and the profile is anonymised. It cannot be restored. Comments and reviews stay, signed “Deleted account”.",
    deleteConfirm: "Delete your account for good? This cannot be undone.",
    deleteLabel: "Delete for good",
    deleteBusy: "Deleting…",
    deleteButton: "Delete account",

    icsHint:
      "Subscribe to this link in the calendar on your phone (Google Calendar, Apple Calendar) — the events you marked yourself as going to will appear there by themselves.",
    icsAria: "Calendar link",
    icsCopy: "Copy",
    icsCopied: "Copied",
    icsRegenerate: "Refresh the link",
    icsRegenerating: "Refreshing…",
    icsRegenerateConfirm: "The old link will stop working. Refresh it?",
  },

  notifications: {
    metaTitle: "Notifications",
    metaDescription: "Trip invitations, friend requests and replies to your comments.",
    eyebrow: "Personal",
    title: "Notifications",
    markAllRead: (n: number) => `Mark as read (${n})`,
    emptyTitle: "Nothing here yet",
    emptyHint:
      "Trip invitations, friend requests and replies to your comments will show up here.",
  },
};
