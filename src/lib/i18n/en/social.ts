/**
 * Друзья и публичный профиль другого пользователя. Названия ачивок сюда
 * не попадают — они данные из базы; здесь только интерфейс вокруг них.
 */
export const social = {
  friends: {
    metaTitle: "Friends",
    metaDescription: "Your friends on MyBLHub.",
    eyebrow: "Profile",
    title: "Friends",
    searchPlaceholder: "Find by name, handle or email (exact)…",
    searchResults: "Search results",
    noneFound: "Nobody found.",
    noName: "No name",
    /** Ответы серверных экшенов заявок. */
    errors: {
      cannotAddSelf: "You can't send a friend request to yourself",
      alreadyRequested: "The request is already sent, or you're already friends",
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

    mine: "My friends",
    emptyTitle: "No friends yet",
    emptyHint:
      "Find people you know by name or handle in the search above — and see what they are going to.",
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

    chipFriends: (n: number) => `friends: ${n}`,
    chipEvents: (n: number) => `events: ${n}`,
    chipPerformers: (n: number) => `actors: ${n}`,
    chipDramas: (n: number) => `series: ${n}`,
    memberSince: (date: string) => `On MyBLHub since ${date}`,

    // Вкладки правой колонки единого профиля (свой и чужой).
    tabs: {
      overview: "Overview",
      stats: "Statistics",
      reviews: "Reviews",
      dramas: "Series",
      events: "Events",
      trips: "Trips",
      places: "Places & lists",
      tickets: (n: number) => `Tickets (${n})`,
    },

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
      review: (rating: number) => `review — ${rating}/10`,
      achievement: "achievement unlocked",
    },

    friendsTitle: "Friends",
    friendsAll: "All friends",
    friendsEmptySelf: "Find people you know on the friends page.",
    friendsEmpty: "No friends yet.",

    dramasTab: {
      emptyTitle: "No series on the list yet",
      emptyHintSelf: "Set a watch status on a series page — the list will live here.",
      emptyHintViewer: (name: string) => `${name} has not marked any series yet.`,
      emptyCta: "Browse the series",
      all: "All series",
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
