export const events = {
    /** Афиша: /events */
    list: {
        metaTitle: "Events",
        metaDescription:
            "Concerts, fan meets and other events with the actors: dates, venues and line-ups.",
        eyebrow: "Events",
        title: "What's on",
        paywallFeature: "The event feed",
        openCalendar: "Open the calendar",
        tabAll: "All",
        tabGoing: "I'm going",
        tabFavorites: "Favourites",
        tabArtists: "My artists",
        searchPlaceholder: "Search by title…",
        rangeEmpty: "No events in this date range.",
        rangeCount: (count: number) =>
            count === 1 ? "1 event in this range." : `${count} events in this range.`,
        emptyUpcoming: "No upcoming events yet.",
        archiveHeading: "Past events",
        // Тизер афиши без подписки: ближайшие события открыты честно,
        // остальная лента — по подписке.
        teaserHeading: "Coming up next",
        // `count` — уже готовая подпись («150+»), `base` — число, по
        // которому она склоняется (в русском словаре).
        teaserIntro: (count: string, base: number) =>
            `The nearest events are open to everyone. A subscription opens the rest of the feed — ${count} more upcoming ${base === 1 ? "event" : "events"} — with search, date filters and reminders that keep you from missing a ticket sale.`,
    },

    /** Календарь: /calendar */
    calendar: {
        metaTitle: "Events calendar",
        metaDescription:
            "A calendar of the actors' concerts and fan meets, birthdays and episode air dates included.",
        backToEvents: "← All events",
        title: "Calendar",
        paywallFeature: "The calendar",
        prev: "← Prev",
        today: "Today",
        next: "Next →",
        viewAll: "All events",
        viewMine: "My events",
        viewBirthdays: "Birthdays",
        viewSeries: "Series",
        birthdayTitle: (name: string, age: number) => `${name} turns ${age}`,
        more: (count: number) => `+${count} more`,
        monthSelect: "Month",
        yearSelect: "Year",
        // Подпись в клетке месяца: номер идёт первым, потому что длинное
        // название обрезается многоточием — обрезаться должно оно.
        seriesFilterAll: "All series",
        seriesFilterMine: "Only mine",
        episodeShort: (number: number) => `Ep. ${number}`,
        episodeTitle: (drama: string, number: number, episodeTitle: string | null) =>
            `${drama} — episode ${number}${episodeTitle ? `: ${episodeTitle}` : ""}`,
        seriesEmptyTitle: "No episodes this month",
        seriesEmptyHint: "No series has an announced air date in this month yet.",
        seriesEmptyCta: "Browse the series",
    },

    /** День календаря: /day/[date] */
    day: {
        metaTitle: (date: string) => `Events on ${date}`,
        metaDescription: (date: string) =>
            `Concerts and fan meets with the actors on ${date}: the schedule for the day.`,
        metaTitleUnknown: "Events of the day",
        metaDescriptionUnknown: "Page not found.",
        backToCalendar: "← Back to the calendar",
        prevDay: "← Previous day",
        nextDay: "Next day →",
        empty: "Nothing is scheduled for this day.",
        eventsHeading: "Events",
        seriesHeading: "Episodes",
    },

    /** Страница события: /event/[id] */
    detail: {
        metaTitleUnknown: "Event",
        metaDescriptionUnknown: "Event not found.",
        metaDescription: (title: string, when: string | null, venue: string) =>
            `${title}${when ? `, ${when}` : ""} — ${venue}. Tickets, line-up and everything else about the event.`,
        backToEvents: "← All events",
        // Сама карточка события открыта всем — по подписке идут планы
        // вокруг неё, поэтому и заголовок заглушки теперь про них.
        paywallFeature: "Plans, tickets and reminders",
        premiumIntro:
            "Everything about the event itself is above and open to everyone. A subscription adds your own plans around it: mark the dates you're going, keep your tickets to hand, see which friends are going and get a reminder before the sale opens.",
        addToCalendar: "Add to calendar",
        tickets: "Tickets",
        venue: "Venue:",
        /** Tooltip on the venue name when the event has a map link. */
        openOnMap: "Open on the map",
        organizer: "Organiser:",
        tags: "Tags:",
        dateAndTime: "Date and time:",
        ticketPrice: "Ticket price:",
        presale: "Ticket presale:",
        presaleTba: "to be announced",
        series: "Series:",
        lineup: "Who's performing",
        lineupByDay: "Line-up day by day",
        description: "About the event",
        photoFullSize: "Open full size",
        friendGoing: "A friend is going",
        friendsGoing: "Friends are going",
        unnamedFriend: "Unnamed",
    },

    /** Чипы «иду» по датам на странице события */
    going: {
        promptPast: "Were you there? Tick the dates — they will count towards your stats:",
        promptFuture: "Going? Tick your dates — they go into your calendar and trip plan:",
        removePast: "Remove the visit mark",
        removeFuture: "Remove from my plan",
        addPast: "Mark that you were there that day",
        addFuture: "I'm going that day",
        dateNotFound: "Event date not found",
    },

    /** Блок «Мои билеты» на странице события */
    tickets: {
        heading: "My tickets",
        open: "Open ticket",
        detach: "Detach ticket",
        uploading: "Uploading…",
        attach: "+ Attach a ticket (PDF or photo)",
        uploadFailed: "Upload failed",
        uploadFailedLong: "We couldn't upload the ticket",
        badFile: "The ticket file didn't pass the check — please upload it again",
        goFirst: "Mark yourself as going to this date first",
        /** Онлайн-бронирование мест/бенефитов, которое открывается после
         *  покупки билета в назначенное время — владелец записывает его
         *  у своего билета и получает напоминание за час. */
        onlineBooking: {
            add: "+ Online booking",
            edit: "Edit online booking",
            remove: "Remove online booking",
            /** «Онлайн-бронирование откроется 12 Sep · 10:00 (MSK 06:00)» */
            opensAt: (when: string) => `Online booking opens ${when}`,
            /** Ссылка есть, а времени нет */
            linkOnly: "Online booking",
            open: "Open",
            date: "Date",
            time: "Time",
            url: "Link (optional)",
            save: "Save",
            cancel: "Cancel",
            reminderHint: "We'll remind you an hour before it opens — in the bell and in Telegram.",
            needDateTime: "Enter both the date and the time",
            badUrl: "The link must start with http:// or https://",
        },
    },

    /** Выгрузка в календарь: ответы маршрута /event/[id]/ics и
     *  подписи внутри самого файла — их человек видит уже в своём
     *  календаре. */
    ics: {
        subscriptionOnly: "Subscribers only",
        notFound: "Event not found",
        noPresale: "No presale date for this event",
        calendarName: "MyBLHub — my events",
        presale: (title: string) => `Presale: ${title}`,
    },

    /** Заметки к событию */
    notes: {
        heading: "Notes",
        add: "+ Add a note",
        placeholder: "For example: grab the merch at the entrance, meet at gate 3…",
        ariaLabel: "Note about the event",
        visPersonal: "Private",
        visFriends: "Visible to friends",
        visTrip: "Visible to my trip mates",
        emptyDeletes: "Clearing the text deletes the note.",
        markPersonal: "private",
        markFriends: "visible to friends",
        markTrip: "visible to trip mates",
        empty: "No notes yet — write the first one: what to bring, where to meet.",
        friend: "Friend",
    },

    /** Карточка и строка события в списках */
    card: {
        myTicket: "My ticket",
        friend: "Friend",
        oneFriendGoing: (name: string) => `${name} is going`,
        manyFriendsGoing: (count: number) => `${count} friends are going`,
        extraDates: (count: number) => (count === 1 ? "+1 more date" : `+${count} more dates`),
        lockedAria: "This event is available with a subscription",
        lockedBadge: "Subscribers only",
        thaiTime: (zone: string, time: string) => `Thai time. ${zone}: ${time}`,
    },

    /** Фильтр по датам над списком */
    filter: {
        range: (from: string, to: string) => `Dates: ${from} – ${to}`,
        button: "Filter by date",
        from: "From",
        to: "To",
        apply: "Show",
        reset: "Reset",
    },

    /** Поиск по каталогу: /search */
    search: {
        metaTitle: "Search",
        metaDescription:
            "One field for the whole catalogue: artists and bands, series, novels, events and filming locations — we look everywhere at once.",
        eyebrow: "Search",
        title: "Search",
        placeholder: "Event, artist, series, location…",
        ariaLabel: "Search query",
        youSearched: (query: string) => `You searched for “${query}” — here is what we found:`,
        hint: "Type the name of an event, artist, series, location or agency.",
        nothingFound: (query: string) => `Nothing found for “${query}”.`,
        sectionEvents: "Events",
        sectionArtists: "Artists",
        sectionSeries: "Series",
        sectionLocations: "Locations",
        sectionAgencies: "Agencies",
        missingSomething: "Didn't find the series or the actor you were after? Tell us — we'll add it.",
        writeToUs: "Write to us",
    },
};
