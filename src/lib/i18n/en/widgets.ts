/** Общие виджеты, которые встречаются в разных разделах: кнопки
 *  избранного и «иду», загрузка файлов, календарь, экран подписки. */
export const widgets = {
  favorite: {
    add: "Add to favourites",
    added: "In favourites",
    remove: "Remove from favourites",
    short: "Favourite",
  },
  going: {
    going: "I'm going",
    notGoing: "I'm not going",
    went: "I was there",
    unwent: "Remove the “I was there” mark",
  },
  visited: {
    mark: "Mark as visited",
    unmark: "Remove from visited",
  },
  /** «Хочу сюда» на странице локации — системный список «Хочу
   *  посетить» (см. src/lib/systemLists.ts). */
  wantToVisit: {
    mark: "I want to go here",
    unmark: "Remove from “Want to visit”",
  },
  file: {
    drop: "Drop a file here or choose one",
    /** Короткая подпись дропзоны для тач-экранов: «перетащите» там
     *  нечем. */
    choose: "Choose a file",
    uploading: "Uploading…",
    thanks: "Thank you! Your message is sent — we'll look into it and reply if needed.",
    kind: "What is this about",
    kindQuestion: "A question",
    kindIdea: "A suggestion or idea",
    kindContent: "Please add a series or an actor",
    email: "Email for a reply",
    message: "Message",
    failed: "Could not upload the file",
    hintImage: "Image, up to 8MB",
    /** Для дропзон, принимающих PDF (брони, билеты): подпись «только
     *  изображение» там говорила неправду. */
    hintPdf: "Image or PDF, up to 8MB",
    remove: "Remove",
  },
  /** Окно кадрирования своей фотографии — см. ImageCropDialog. */
  crop: {
    title: "Adjust your photo",
    hint: "Drag the photo to move it and use the slider to zoom. What's inside the frame becomes your picture.",
    preview: "Photo preview inside the frame",
    zoom: "Zoom",
    apply: "Use this photo",
    applying: "Preparing…",
    failed: "We couldn't process this image, try another file",
  },
  /** Подписи к машинным кодам ошибок из /api/upload* — см.
   *  src/lib/uploadErrors.ts. Предел размера и список форматов у ручек
   *  разные, поэтому приезжают в ответе и подставляются здесь. */
  upload: {
    notAuthorized: "You need to sign in to upload a file",
    noFile: "The file didn't reach us, please try again",
    badType: (formats: string) => `Allowed formats: ${formats}`,
    tooLarge: (maxMb: number) => `The file is too large — ${maxMb}MB maximum`,
    badImage: "We couldn't process this image, try another file",
  },
  datePicker: {
    placeholder: "Pick a date",
    aria: "Pick a date",
    prevMonth: "Previous month",
    nextMonth: "Next month",
    today: "Today",
    month: "Month",
    year: "Year",
    clear: "Clear",
  },
  errors: {
    /** Общая фраза «запрос не дошёл» для catch-веток форм: раньше каждая
     *  придумывала свою, а форма создания сообщества и вовсе показывала
     *  чужую («Укажите название») на любую ошибку сети. */
    network: "Couldn't reach the server, please try again",
    notFoundHint: "There's no such page — it may have been removed, or the link has a typo.",
    goHome: "Go home",
    goSearch: "Search",
    errorEyebrow: "Error",
    errorTitle: "Something went wrong",
    errorHint: "The report is already with us. Try again — that usually does it; if it doesn't, write to us from the help page.",
    tryAgain: "Try again",
  },
  tour: {
    eventsTitle: "The event feed",
    eventsText: "Every concert and fan meet, by date, with the line-up and the venue. The nearest events are open to everyone as a teaser; the full feed comes with the subscription.",
    favTitle: "Favourites and “going”",
    favText: "The heart saves an event, “going” marks that you'll be there — then a reminder comes, and friends can see you're planning to go.",
    artistsTitle: "Artists and groups",
    artistsText: "Profiles, series and concerts for each of them. From here you can add someone to favourites, to a list of your own, or mark that you've seen them live.",
    seriesTitle: "Series",
    seriesText: "The catalogue with watch statuses and episode schedules: new episodes land in the calendar on its “Series” tab. Already keep a list on MyDramaList? Bring it over in Settings → Import.",
    locationsTitle: "Filming locations",
    locationsText: "Cafés, hotels and venues from the series — with a map and categories, so you can build a route around a show you love.",
    tripsTitle: "Trips",
    tripsText: "A plan for your dates: events, places to stay, spots to visit, and shared access for whoever is travelling with you.",
    searchTitle: "Search with filters",
    searchText: "One box for artists, series, events, locations and novels. Open a section tab and narrow the results down with filters — genre, year, status.",
    notificationsTitle: "Notifications",
    notificationsText: "Trip invitations, friend requests, replies to comments and new episodes of series you follow land here. In settings you can connect Telegram and get them in the messenger.",
    profileTitle: "Profile",
    profileText: "Statistics, achievements, your lists and tickets. Look in after your first concert — the counters will start filling up.",
    stepOf: (n: number, total: number) => `${n} of ${total}`,
    next: "Next",
    close: "Close",
    skip: "Skip",
  },
  promo: {
    label: "Promo code",
    redeem: "Redeem",
    failed: "Couldn't reach the server, please try again",
    signInRequired: "You need to sign in",
    enterCode: "Enter a code",
    noSuchCode: "No such code",
    alreadyUsed: "This code has already been used",
    activated: (until: string) => `Subscription active until ${until} — reload the page!`,
  },
  report: {
    unknownType: "Unknown report type",
  },
  feedback: {
    optional: " (optional)",
    placeholder: "Tell us what you found, what broke, or who's missing…",
    sending: "Sending…",
    send: "Send",
    failed: "Couldn't reach the server, please try again",
    thanks: "Thank you! Your message is sent — we'll look into it and reply if needed.",
    kind: "What is this about",
    kindQuestion: "A question",
    kindIdea: "A suggestion or idea",
    kindContent: "Please add a series or an actor",
    email: "Email for a reply",
    message: "Message",
    errorEmpty: "Please write your message",
    errorTooLong: "The message is too long",
    errorEmail: "Leave an email so we can reply",
  },
  addToList: {
    button: "Add to a list",
    already: "already in the list",
    add: "add",
    empty:
      "You don't have any artist lists yet. You can create one in your profile — “seen live” or “want to go to a concert”, for example.",
  },
  maybe: {
    add: "Might go",
    remove: "Remove “might go”",
    short: "Might go",
    badge: "might go",
    clash: (n: number) => `${n} more at the same time`,
  },
  seenLive: {
    mark: "Mark: seen live",
    unmark: "Seen live — remove the mark",
    short: "Seen live",
    open: "Seen live — where exactly",
    count: (n: number) => `Seen live · ${n}`,
    hint: "Mark the events where you actually saw this artist. Removing the mark on one event leaves the others alone.",
    noEvents: "None of your attended events has this artist in the line-up yet.",
    markAll: "Saw everyone",
    markNone: "No one",
    markHere: "Seen here",
    unmarkHere: "Not seen here",
    outside: "Seen outside the feed",
    outsideHint: "A concert before you joined, a chance meeting",
    personal: (n: number) => `Personal events on trips: ${n}`,
    personalHint: "edited inside the trip",
  },
  commentLike: {
    like: "Like",
    unlike: "Remove the like",
  },
  map: {
    loading: "Loading the map…",
    empty: "No locations with coordinates.",
  },
  scrollTop: "Back to top",
  loading: "Loading",
  back: "← Back",
  premium: {
    title: "This is part of the subscription",
    lead: "What you get:",
    cta: "Learn about the subscription",
    presales: "Presales under control: a Telegram reminder an hour before sales open, so tickets don't slip away",
    feed: "The full feed and calendar: every concert and fan meet with dates, venues and line-ups",
    trips: "Trips without spreadsheets: events, hotels and places to go in one plan for your dates",
    ics: "Your phone's calendar: subscribe by ICS and events show up there on their own",
    going: "Your plans on the event: “going” marks, tickets at hand, notes and “friends are going”",
    stats: "Stats and achievements: events and artists seen live, hours watched — with medals to show",
    create: "Your own on the site: places and place lists, artist lists and communities",
    heading: (feature: string) => `${feature} — with a subscription`,
    priceOneClick: (price: number) => `${price} Stars a month · renew in one tap`,
    writeHint: "Subscriptions are added by hand — get in touch",
    orForm: "through the feedback form",
    subscribe: "Get the subscription",
    pay: "Pay in Telegram",
    paying: "Creating the invoice…",
    payFailed: "We couldn't create the invoice — please try again later",
    /** Подарочная подписка (аудит 2026-09 п.8). */
    gift: "Gift a subscription",
    giftHint:
      "After payment a one-time promo code with a gift note arrives in your Telegram chat with the bot — forward it to the person you're gifting.",
    giftContactText: "Hi! I'd like to gift a MyBLHub subscription to a friend.",
  },

  /** Промо-плашка «сейчас всё открыто» (решение владельца 2026-09-15).
   *  Текст обещает ровно две вещи, которые мы правда можем сдержать:
   *  предупредить заранее и не отобрать уже созданное. Даты окончания
   *  промо тут нет намеренно — её никто не назначал, а названная дата
   *  стала бы обещанием. */
  freeAccess: {
    ariaLabel: "Promo: full access, on the house",
    text: "Full access, on the house: every subscription feature is open to everyone — the whole event feed, the calendar, trips, lists and stats. Whatever you create stays yours.",
    link: "What the subscription covers",
    dismiss: "Thanks!",
    heading: (feature: string) => `${feature} — on the house`,
    signupCta: "Create an account",
    signupHint: "All of it is open to everyone — an account is all you need.",
  },
};
