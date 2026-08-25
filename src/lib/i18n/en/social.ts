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
    removeConfirm: (name: string) => `Remove «${name}» from your friends?`,
    backToProfile: "← Back to your profile",
  },

  profile: {
    metaTitle: "User",
    metaNotFound: "Profile not found.",
    metaDescription: (name: string) => `${name}'s profile on MyBLHub.`,
    metaDescriptionAnonymous: "A user profile on MyBLHub.",
    fallbackName: "User",
    back: "← Friends",

    chipFriends: (n: number) => `friends: ${n}`,
    chipEvents: (n: number) => `events: ${n}`,
    chipPerformers: (n: number) => `actors: ${n}`,
    chipDramas: (n: number) => `series: ${n}`,
    memberSince: (date: string) => `On MyBLHub since ${date}`,

    itsYou: "This is you · to your account",
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
      `Once ${name} marks an event as «going», it will show up here.`,

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
