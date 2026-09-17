/**
 * Друзья и публичный профиль другого пользователя. Названия ачивок сюда
 * не попадают — они данные из базы; здесь только интерфейс вокруг них.
 */

/**
 * Подпись вкладки профиля со счётчиком в скобках (правка владельца
 * 2026-09-08: «в табах профиля тоже выводить в скобках количество, где у
 * нас сколько чего»). Ноль НЕ показываем: пустые скобки у вкладки, в
 * которой ничего нет, только шумят — вкладка и так откроется пустым
 * состоянием. Помощник один на все вкладки, чтобы скобки, пробел и
 * правило нуля не расползались по десяти строкам словаря.
 */
const withCount = (label: string, n: number) => (n > 0 ? `${label} (${n})` : label);

export const social = {
  friends: {
    metaTitle: "Friends",
    metaDescription: "Your friends on MyBLHub.",
    eyebrow: "Profile",
    title: "Friends",
    searchPlaceholder: "Find by name, handle or email (exact)…",
    searchResults: "Search results",
    noName: "No name",
    /** Ответы серверных экшенов заявок. */
    errors: {
      cannotAddSelf: "You can't send a friend request to yourself",
      alreadyRequested: "The request is already sent, or you're already friends",
      userNotFound: "User not found",
      notFriends: "You are not friends yet",
    },
    /** Внутри фразы («Удалить «без имени» из друзей?») — с маленькой. */
    noNameInline: "no name",

    add: "Add friend",
    adding: "Sending…",
    incoming: "Friend requests",
    accept: "Accept",
    decline: "Decline",
    declineConfirm: "Decline this friend request?",
    outgoing: "Requests you sent",
    cancel: "Cancel",
    cancelConfirm: "Cancel this friend request?",

    /** Блок «Пригласить» в настройках (аудит 2026-09 п.7). */
    invite: {
      title: "Invite a friend",
      hint: "Share your link — whoever signs up through it becomes your friend right away.",
      aria: "Invite link",
      copy: "Copy link",
      copied: "Copied!",
    },

    mine: "My friends",
    lead: "Add people you know — and you'll see who of them is going to the same event, what they watch and where they're headed.",
    count: (n: number) => `${n} ${n === 1 ? "friend" : "friends"}`,
    findTitle: "Find people",
    findHint: "By name, handle or exact email.",
    suggestions: "People you may know",
    suggestionsHint: "Friends of your friends",
    mutual: (n: number) => `${n} mutual ${n === 1 ? "friend" : "friends"}`,
    emptyTitle: "No friends yet",
    emptyHint:
      "Find people you know by name or handle — or share the invite link from your settings: whoever joins through it becomes your friend right away.",
    remove: "Remove from friends",
    removeConfirm: (name: string) => `Remove “${name}” from your friends?`,
    backToProfile: "← Back to your profile",
  },

  profile: {
    metaTitle: "User",
    metaNotFound: "Profile not found.",
    metaDescription: (name: string) => `${name}'s profile on MyBLHub.`,
    metaDescriptionAnonymous: "A user profile on MyBLHub.",
    fallbackName: "User",

    // chip*-счётчики левой колонки удалены — правка владельца: ряда
    // чипов в блоке с фото больше нет.

    /* Labelled info rows (owner request, MDL-style). The Role row was
       added and removed the same day — naming didn't land. */
    metaOnline: "Last online",
    metaOnlineNow: "online now",
    metaLocation: "Location",
    metaBirthday: "Birthday",

    // Вкладки правой колонки единого профиля (свой и чужой).
    // Счётчик в скобках — у всех вкладок, где есть что считать (правка
    // владельца 2026-09-08). Без счётчика остались «Обзор» (сводка, а не
    // список) и «Статистика» (там числа и есть содержимое).
    tabs: {
      overview: "Overview",
      stats: "Statistics",
      reviews: (n: number) => withCount("Reviews", n),
      comments: (n: number) => withCount("Comments", n),
      dramas: (n: number) => withCount("Series", n),
      events: (n: number) => withCount("Events", n),
      trips: (n: number) => withCount("Trips", n),
      places: (n: number) => withCount("Places & lists", n),
      communities: (n: number) => withCount("Communities", n),
      tickets: (n: number) => withCount("Tickets", n),
    },
    // Кнопки прокрутки ряда вкладок (правка владельца 2026-09-08).
    tabsScrollPrev: "Scroll tabs left",
    tabsScrollNext: "Scroll tabs right",

    // Заголовки левой колонки «Обзора» (лента ужалась вправо, слева —
    // содержательные блоки).
    overviewWatching: "Watching now",
    overviewGoing: "Coming up",
    overviewReviews: "Recent reviews",

    // «Последние обновления»: лента активности из существующих таблиц
    // (см. src/lib/activityFeed.ts) — иконка, действие, ссылка, дата.
    activity: {
      title: "Latest updates",
      emptyTitle: "No updates yet",
      emptyHintSelf:
        "Mark series, add favourite artists, plan events — your updates will show up here.",
      emptyHintViewer: (name: string) => `${name} has no visible updates yet.`,
      watch: (status: string) => `watch status — ${status.toLowerCase()}`,
      episodes: (n: number, total: number | null) =>
        total ? `episode ${n} of ${total}` : `episode ${n}`,
      favorite: "now a favourite artist",
      going: "going to the event",
      trip: "new trip",
      review: (rating: string) => `review — ${rating}/10`,
      achievement: "achievement unlocked",
    },

    friendsTitle: "Friends",
    friendsAll: "All friends",
    friendsEmptySelf: "Find people you know on the friends page.",
    friendsEmpty: "No friends yet.",

    /** Совместимость вкусов на чужом профиле (аудит 2026-09, раздел 7):
     *  пересечение отмеченных сериалов зрителя и владельца, плюс
     *  совпавшие оценки 9+. Формулировки без рода — пол обоих людей
     *  неизвестен. */
    tasteMatch: {
      title: "Taste match",
      common: (n: number) => `${n} series in common with you`,
      bothHigh: (n: number) => `Rated 9+ by you both: ${n}`,
    },

    dramasTab: {
      emptyTitle: "No series on the list yet",
      emptyHintSelf: "Set a watch status on a series page — the list will live here.",
      emptyHintViewer: (name: string) => `${name} has not marked any series yet.`,
      emptyCta: "Browse the series",
      all: "All series",
      // Первая пилюля под-табов (правка владельца 2026-09-06): без неё
      // сортировка по колонке «Статус просмотра» бессмысленна.
      allTab: "All",
    },

    commentsTab: {
      emptyTitle: "No comments yet",
      emptyHintSelf: "Join a discussion on a series, novel or event page — your comments will be collected here.",
      emptyHintViewer: (name: string) => `${name} has not commented on anything yet.`,
    },

    tripsTab: {
      emptyTitle: "No trips yet",
      emptyHintSelf: "Plan your first trip — events, places and days in one plan.",
      emptyCtaSelf: "Open trips",
      emptyHintViewer: (name: string) => `${name} has no trips visible to you.`,
      manage: "All trips",
    },

    placesTab: {
      emptyTitle: "Nothing here yet",
      emptyHintSelf: "Place lists and visited filming locations will be collected here.",
      emptyHintViewer: (name: string) => `${name} has no visible lists or places yet.`,
      emptyCtaSelf: "My places",
    },
    /** Вкладка «Сообщества». В чужом профиле здесь только публичные
     *  сообщества — закрытые не показываются никому, кроме владельца
     *  профиля (см. docs/features/communities.md). */
    communitiesTab: {
      emptyTitle: "Not in any community yet",
      emptyHintSelf: "Communities you join will show up here.",
      emptyHintViewer: (name: string) => `${name} is not in any community you can see.`,
      emptyCtaSelf: "Browse communities",
      privateNote: "Only you can see this one here — it is a private community.",
    },
    yourFriend: "Your friend",
    requestSent: "Request sent",
    answerRequest: "Answer the request",
    addFriend: "Add friend",
    adding: "Sending…",
    notifyOn: "Notifications on",
    notifyOff: "Notifications off",
    notifyOnTitle: "Notifications about this friend are on",
    notifyOffTitle: "Notifications about this friend are off",

    hidden: "This profile keeps its activity private.",
    achievements: "Achievements",
    /* Переделка блока 2026-09-17: последнее достижение карточкой,
       «есть у N фанатов», ближайшее с прогрессом (только себе). */
    achievementsLatest: "Latest",
    achievementsHolders: (n: number) => `${n} ${n === 1 ? "person has it" : "people have it"}`,
    friendsMore: (n: number) => `${n} more`,
    going: "Going to",
    goingLocked: "🔒 Event lists come with a subscription.",
    goingLockedWithCount: (n: number) =>
      `🔒 ${n} ${n === 1 ? "event" : "events"} — event lists come with a subscription.`,
    goingEmptyTitle: "Not going anywhere yet",
    goingEmptyHint: (name: string) =>
      `Once ${name} marks an event as “going”, it will show up here.`,

    trips: "Trips",
    visibility: {
      PRIVATE: "Private",
      FRIENDS: "Friends only",
      PUBLIC: "Public",
    },

    placeLists: "Place lists",
    placeCount: (n: number) => `${n} ${n === 1 ? "place" : "places"}`,
    artistLists: "Actor lists",
    artistCount: (n: number) => `${n} ${n === 1 ? "actor" : "actors"}`,
    visitedPlaces: "Places visited",
    favoritePerformers: "Favourite actors",
  },
};
