export const home = {
    // С-1: заголовок главной с ключевыми словами — уходит в <title> и
    // в выдачу (суффикс « — MyBLHub» дописывает title.template).
    metaTitle: "Series, actors and events: fan tracker",
    eyebrow: "Home",
    hello: "Hi,",
    greeting: (name: string) => `Hi, ${name}`,
    startTitle: "Where to start",
    startArtists: "Pick your favourite artists",
    startArtistsHint: "Their events and releases will land in your feed",
    startFriends: "Find friends",
    startFriendsHint: "See what they watch and which events they go to",
    startCommunities: "Look into communities",
    startCommunitiesHint: "That is where meetups and episodes get discussed",
    startDramas: "Mark what you are watching",
    startDramasHint: "Episode counter, ratings and stats come from your marks",
    upcoming: "What's next",
    // Блок «выходит сегодня» — над «Что нового».
    airingToday: "Airing today",
    airingTodayCalendar: "Calendar",
    /** Переключатель «Выходит сегодня»: вся афиша или только
     *  отмеченное человеком (просьба владельца 2026-09-06). */
    airingAll: "All",
    airingMine: "Mine",
    airingTodayEpisode: (n: number) => `Episode ${n}`,
    // Сдвоенный показ: одной карточкой с диапазоном.
    airingTodayEpisodes: (from: number, to: number) => `Episodes ${from}–${to}`,
    watchingNow: "Watching now",
    /** Блок «В ваших сообществах» (АА25): ближайшие встречи и свежие
     *  темы из сообществ, где человек СОСТОИТ. Строки живут здесь, а не
     *  в словаре сообществ, потому что правятся вместе с главной. */
    communities: "In your communities",
    communityMeetups: "Upcoming meetups",
    communityPosts: "Latest discussions",
    communityReplies: (n: number) => `${n} ${n === 1 ? "reply" : "replies"}`,
    whatsNew: "What's new",
    /** Новость про места съёмок: у сериала появились локации
     *  (просьба владельца 2026-09-06). */
    newsLocations: "Filming locations",
    newsLocationsCount: (n: number) => `${n} ${n === 1 ? "place" : "places"} added`,
    newsFromFavourites: "releases by your artists",
    newsFromCatalogue: "fresh in the catalogue",
    listen: "Listen ↗",
    birthdays: "Birthdays today",
    /** «В этот день» — ностальгия рядом с днями рождения: сериалы,
     *  стартовавшие в этот же день в прошлые годы (Drama.airedFrom). */
    onThisDay: "On this day",
    onThisDayAgo: (years: number) =>
      years === 1 ? "premiered a year ago" : `premiered ${years} years ago`,
    /** Мини-блок «У друзей» — сознательно минимальная версия ленты
     *  друзей (Г3): три записи, без своей страницы. */
    friendsFeed: "Your friends lately",
    turns: (age: number) => `turns ${age}`,
    yourFriend: "your friend",
    inFavourites: "in favourites",
    shared: "shared",
    countdownToday: "happening now",
    countdownTomorrow: "tomorrow",
    countdownDays: (days: number) => `in ${days} days`,
    countdownMonth: "in a month",
    countdownMonths: (months: number) => `in ${months} months`,
    paywallTitle: "The event feed and “going” marks are for subscribers",
    paywallHint:
      "The full feed with dates and presales, a calendar and Telegram reminders.",
    paywallCta: "Learn more",
    emptyGoingTitle: "Nothing planned yet",
    emptyGoingHint:
      "Find an event in the feed and mark “I'm going” — it will show up here as a poster.",
    emptyGoingCta: "Browse the feed",
    emptyNewsTitle: "Nothing here yet",
    emptyNewsHint: "Add artists to your favourites and their releases will appear here.",
    emptyNewsCta: "To the artists",
};
