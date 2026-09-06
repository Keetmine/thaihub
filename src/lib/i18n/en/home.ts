export const home = {
    // С-1: заголовок главной с ключевыми словами — уходит в <title> и
    // в выдачу (суффикс « — MyBLHub» дописывает title.template).
    metaTitle: "Series, actors and events: fan tracker",
    eyebrow: "Home",
    greeting: (name: string) => `Hi, ${name}`,
    upcoming: "What's next",
    // Блок «выходит сегодня» — над «Что нового».
    airingToday: "Airing today",
    airingTodayCalendar: "Calendar",
    airingTodayEpisode: (n: number) => `Episode ${n}`,
    // Сдвоенный показ: одной карточкой с диапазоном.
    airingTodayEpisodes: (from: number, to: number) => `Episodes ${from}–${to}`,
    watchingNow: "Watching now",
    whatsNew: "What's new",
    /** Новость про места съёмок: у сериала появились локации
     *  (просьба владельца 2026-09-06). */
    newsLocations: "Filming locations",
    newsLocationsCount: (n: number) => `${n} ${n === 1 ? "place" : "places"} added`,
    newsFromFavourites: "releases by your artists",
    newsFromCatalogue: "fresh in the catalogue",
    listen: "Listen ↗",
    birthdays: "Birthdays today",
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
