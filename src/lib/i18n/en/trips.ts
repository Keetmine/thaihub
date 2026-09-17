/**
 * Поездки: список поездок, страница поездки (план, афиша, дела, что
 * посетить), личные события, брони и участники.
 */
export const trips = {
    eyebrow: "Planning",
    paywallFeature: "Trips",
    /** Мостик на апселле /trips, когда бесплатная поездка уже создана
     *  (пробный лимит, аудит 2026-09 п.8). */
    freeLimitIntro: "One trip is free to try — you already have yours. A subscription lifts the limit.",

    /** Список поездок: /trips */
    list: {
        metaTitle: "Trips",
        metaDescription: "Your trips and the plans you share with friends.",
        title: "My trips",
        intro:
            "A trip is the dates you are away: its page gathers every event that falls inside them.",
        invites: "Invitations",
        invitedBy: (name: string) => `invited by ${name}`,
        emptyTitle: "No trips yet",
        emptyHint:
            "Start one with your dates — events, hotels and place lists come together into a single plan.",
        pastHeading: "Past",
        shared: "shared",
        sharedSuffix: " · shared",
        organiser: (name: string) => `Organised by ${name}`,
        noName: "no name",
    },

    /** Страница поездки: /trips/[id] */
    detail: {
        back: "← All trips",
        ofUser: (name: string) => `${name}'s trip →`,
        inviteBanner: (name: string) =>
            `${name} is inviting you on this trip — you will see the shared plan and can add your own events and to-dos.`,
        someone: "Someone",
        tabPlan: () => "Plan",
        /** Без счётчика: в ленте плана не только события (правка
         *  владельца 2026-09-06). */
        tabMyPlan: () => "My plan",
        tabEvents: (n: number) => `What's on (${n})`,
        tabTodos: (n: number) => `To-do list (${n})`,
        tabPacking: (n: number) => `Packing (${n})`,
        tabShopping: (n: number) => `Shopping (${n})`,
        tabPlaces: (n: number) => (n > 0 ? `Places to go (${n})` : "Places to go"),
        onlyMine: "Only mine",
        deleteTrip: "Delete trip",
        deleteConfirm: (title: string) => `Delete the trip "${title}"?`,

        pastDays: (n: number) => `Past days (${n})`,
        emptyPlanTitle: "Your plan is empty",
        emptyPlanHintOwn:
            "Mark yourself as going on the What's on tab, or add something of your own — a flight, a booking, a meet-up.",
        emptyPlanHintGuest: "No one has added anything to the plan yet.",
        emptyEventsTitle: "Nothing on these dates",
        emptyEventsHint: "No event in the listings falls inside this trip's dates.",
    },

    /** Форма создания и редактирования поездки. */
    form: {
        open: "+ New trip",
        createTitle: "New trip",
        editTitle: "Edit trip",
        editAria: "Edit trip",
        title: "Title",
        titlePlaceholder: "Bangkok, October",
        from: "From",
        to: "To",
        members: "Who is coming (they see the plan and can add their own events)",
        membersPlaceholder: "Pick friends…",
        creating: "Creating…",
        submitCreate: "Create",
        saving: "Saving…",
        createFailed: "Couldn't create the trip — try again",
        saveFailed: "Couldn't save — try again",
    },

    /** Кто видит поездку. */
    visibility: {
        label: "Who can see the trip",
        aria: "Trip visibility",
        options: {
            PRIVATE: "Private",
            FRIENDS: "Friends only",
            PUBLIC: "Public",
        },
        hints: {
            PRIVATE: "only you can see it",
            FRIENDS: "your friends can see it",
            PUBLIC: "anyone with the link can see it",
        },
    },

    /** Кто видит отдельную запись поездки — дело, личное событие, бронь.
     *  Не путать с `visibility` выше: та про саму поездку. */
    /** Свои даты участника в общей поездке (АА17): «я лечу 18-го, а
     *  ты 22-го». Поездка одна, разъезжается только присутствие. */
    stay: {
        button: "My dates",
        title: "My dates on this trip",
        hint: "Flying for only part of the trip? Set your own dates. Empty means the whole trip.",
        from: "Arrival",
        to: "Departure",
        save: "Save",
        clear: "Whole trip",
        whole: "whole trip",
        arrives: (name: string) => `✈ ${name} arrives`,
        arrivesYou: "✈ you arrive",
        leaves: (name: string) => `✈ ${name} leaves`,
        leavesYou: "✈ you leave",
    },

    itemVisibility: {
        label: "Who can see this",
        options: {
            PRIVATE: "Only me",
            PARTICIPANTS: "Trip members",
            FRIENDS: "My friends",
            PUBLIC: "Everyone",
        },
        hints: {
            PRIVATE: "no one else — not even the people travelling with you",
            PARTICIPANTS: "everyone travelling with you",
            FRIENDS: "your friends, if the trip is visible to them",
            PUBLIC: "anyone who can see the trip",
        },
        /** Почему вариантов меньше четырёх: запись не может быть виднее
         *  самой поездки. Ключ — самый открытый оставшийся вариант. */
        cappedBy: {
            FRIENDS: "The trip itself is friends-only, so nothing inside it can go wider.",
            PRIVATE:
                "The trip itself is private — only you and the people travelling with you can see what's inside.",
        },
        /** Бейдж в строке — только там, где видимость не «участники». */
        badges: {
            PRIVATE: "only me",
            FRIENDS: "friends",
            PUBLIC: "everyone",
        },
    },

    /** Личные события внутри поездки. */
    personal: {
        addLabel: "+ Personal event",
        addShort: "+ Event",
        addTitle: "Personal event",
        editTitle: "Edit event",
        adding: "Adding…",
        addFailed: "Couldn't add the event — try again",
        saveFailed: "Couldn't save — try again",
        badge: "personal",
        performers: "Artists at the event",
        performersHint:
          "Who you will see there — once the date passes, they join your “seen live” list if “I’ll be there” is on.",
        performersPlaceholder: "Start typing a name…",
        deleteConfirm: (title: string) => `Delete "${title}"?`,
        attachmentOf: (title: string) => `Attachment on "${title}"`,
        file: "File ↗",

        title: "Title",
        titlePlaceholder: "Dinner with friends",
        date: "Date",
        time: "Time",
        note: "Note",
        image: "Image",
        /** Ссылка у личного события: бронь, страница мероприятия, карта. */
        url: "Link",
        urlPlaceholder: "https://…",
        urlOpen: "Open the link",
        attending: "I’ll be there",
        showOnHome: "Show on the home page",
        editableByOthers: "Trip members can edit and delete this",
    },

    /** Поле выбора места в форме личного события. */
    placePicker: {
        label: "Place (optional)",
        remove: "remove",
        namePlaceholder: "Place name",
        nameAria: "Name of the new place",
        mapsPlaceholder: "Google Maps link or \"13.75, 100.50\"",
        mapsAria: "Google Maps link or coordinates",
        creating: "Creating…",
        createAndPick: "Create and select",
        searchPlaceholder: "Start typing a location name…",
        ownPlace: "+ Own place",
        nameRequired: "Give the place a name",
        createFailed: "Couldn't create the place — check the link and try again",
    },

    /** Участники совместной поездки. */
    members: {
        button: (n: number) => `Members (${n})`,
        title: "Trip members",
        noName: "No name",
        owner: "organiser",
        pending: "invite sent",
        cancelInviteConfirm: (name: string) => `Cancel the invite for ${name}?`,
        removeConfirm: (name: string) =>
            `Remove ${name} from the trip? They lose access to the plan, the lists and the bookings, and their entries stay here.`,
        removeAria: "Remove from trip",
        addFriend: "Add a friend…",
        addFailed: "Couldn't add them — try again",
        noFriendsLeft:
            "You can only invite friends — everyone on your list is already here, or you have not added anyone yet.",
        leaveConfirm:
            "Leave this trip? You lose access to its plan, lists and bookings, and your entries stay with the others. Your “going” marks on events stay yours.",
        leave: "Leave trip",
        leaveTitle: "Leave the trip",
        leaveWhatGoes: "Your packing list, shopping list and private entries in this trip will be deleted. What you shared with the others — to-dos, meetups, bookings — stays with them. Your “going” marks on events stay yours.",
        leaveWithCopy: "Leave and keep a copy",
        leaveWithCopyHint: "We will create a personal trip with your entries and your dates — nothing to move by hand.",
        leavePlain: "Just leave",
        copyFailed: "Could not keep a copy — please try again",
        hint:
            "Your friend gets an invite and joins once they accept it. Members see the plan, the to-dos and the personal entries, and can add their own. Someone else's entry can only be changed if its author ticked the box allowing it.",
        accept: "Accept",
        decline: "Decline",
    },

    /** Вкладка «Что посетить». */
    places: {
        attachAria: "Attach a list",
        attachOption: "+ Attach a list…",
        detach: "Detach",
        removeAria: "Remove place",
        addButton: "+ Place to go",
        addTitle: "Add a place",
        addPlaceholder: "+ Add a place…",
        searchLabel: "Find it in the catalogue or among your own places",
        ownPlace: "+ Own place",
        ownPlaceSubmit: "Create and add to the trip",
        standalone: "Individual places",
        emptyGuestTitle: "Nothing here yet",
        emptyGuestHint: "No one has added places to this trip yet.",
        emptyTitle: "No places yet",
        emptyHint:
            "Add your own from a Google Maps link, find one in the catalogue or attach a list — this is where the trip's shortlist lives.",
        /** Day route: a plain Google Maps directions link, no API keys
         *  (see src/lib/dayRoute.ts). */
        routeButton: "Build a route",
        routeCapped: (shown: number, total: number) =>
            `Google Maps takes up to ${shown} stops — the route has the first ${shown} of ${total}`,
    },

    /** Дела поездки. */
    todos: {
        note: "Description",
        url: "Link",
        urlPlaceholder: "https://…",
        openLink: "Open link",
        markUndone: "Mark as not done",
        markDone: "Mark as done",
        /** Row-of-actions button: adds one to-do, not a list. */
        addButton: "+ To-do",
        addTitle: "New to-do",
        editAria: "Edit to-do",
        deleteAria: "Delete to-do",
        deleteConfirm: "Delete this to-do?",
        editTitle: "Edit to-do",
        text: "What to do",
        newText: "New to-do",
        newPlaceholder: "Buy a SIM, change money…",
        dateOptional: "Date (optional)",
        time: "Time",
        editableByOthers: "Trip members can edit and delete this",
        editableByOthersShort: "Members can edit and delete this",
        emptyTitle: "No to-dos yet",
        emptyHintOwn: "Add the first one with the button — buy tickets, change money, pick up merch.",
        emptyHintGuest: "No one has added anything yet.",

        /** Три списка одной вкладки: дела, чемодан, покупки (АА10/АА11). */
        lists: {
            /** Быстрый ввод во вкладках чемодана и покупок. */
            quickAddPacking: "Add a thing to pack…",
            quickAddShopping: "Add a thing to buy…",
            quickAddAria: "Add to the list",
            /** Кнопка добавления внутри вкладки чемодана и покупок. */
            addButton: "+ Add",
            /** Сколько готово — строкой над списком чемодана/покупок. */
            progressPacking: (done: number, total: number) => `${done}/${total} packed`,
            progressShopping: (done: number, total: number) => `${done}/${total} bought`,
            addPackingTitle: "New item to pack",
            addShoppingTitle: "New purchase",
            packingPlaceholder: "Adapter, sunscreen, meds…",
            shoppingPlaceholder: "Magnets for mum, sneakers, 7-Eleven snacks…",
            packingEmptyTitle: "The suitcase is empty",
            packingEmptyOwn: "Write down what you must not forget — the list carries over from trip to trip in your head anyway.",
            shoppingEmptyTitle: "Nothing on the shopping list",
            shoppingEmptyOwn: "Add what you want to bring home — you'll want it anyway, better not to forget.",
        },
    },

    /** Жильё и перелёты. */
    bookings: {
        /** Заголовок над бронями без дат — датированные стоят в самой
         *  ленте плана, в своих днях. */
        undatedHeading: "Stays and flights without dates",
        addHotel: "+ Hotel",
        addFlight: "+ Flight",
        hotelTitle: "Hotel booking",
        flightTitle: "Flight",
        hotelName: "Hotel *",
        flightName: "Flight or airline *",
        namePlaceholder: "Name",
        from: "From",
        fromPlaceholder: "Moscow",
        to: "To",
        toPlaceholder: "Bangkok",
        departure: "Departure",
        departureTimeAria: "Departure time",
        arrival: "Arrival",
        arrivalTimeAria: "Arrival time",
        time: "Time",
        address: "Address",
        addressPlaceholder: "Street, district",
        checkIn: "Check-in",
        checkInTimeAria: "Check-in time",
        checkOut: "Check-out",
        checkOutTimeAria: "Check-out time",
        /** Вторая половина брони в строке ленты: у заезда — до какого
         *  числа и сколько ночей, у выезда — с какого числа. */
        stayUntil: (date: string) => `until ${date}`,
        stayFrom: (date: string) => `from ${date}`,
        nights: (n: number) => (n === 1 ? "1 night" : `${n} nights`),
        /** Схлопнутая строка — обе стороны брони одной записью, когда
         *  между ними в ленте ничего нет: подпись вместо «Check-in» /
         *  «Departure». */
        flightSpan: "Flight",
        staySpan: "Hotel",
        /** Цепочка перелётов одной строкой: пересадка в скобках прямо в
         *  маршруте — «Moscow (layover 5 h 20 min) → …», без длительности,
         *  когда у сегмента нет времени; и подпись раскрывашки. */
        layover: "layover",
        layoverFor: (duration: string) => `layover ${duration}`,
        segments: (n: number) => `${n} segments`,
        ticketUrl: "Ticket link",
        bookingUrl: "Booking link",
        ticketFile: "Ticket file",
        bookingFile: "Booking file",
        note: "Note",
        flightNotePlaceholder: "Seat, baggage, booking reference",
        hotelNotePlaceholder: "Booking code, floor, check-in time",
        ticketLink: "Ticket ↗",
        bookingLink: "Booking ↗",
        link: "Link ↗",
        editFlight: "Edit flight",
        editBooking: "Edit booking",
        deleteFlight: "Delete flight",
        deleteBooking: "Delete booking",
        deleteConfirm: (name: string) => `Delete "${name}"?`,
    },

    /** Ответы серверных экшенов — их показывают формы поездки. */
    expenses: {
        tab: (n: number) => (n > 0 ? `Expenses · ${n}` : "Expenses"),
        fieldPrice: "What it cost",
        pricePlaceholder: "Can be left empty",
        fromBooking: "from a booking",
        fromEvent: "from an event",
        fromShopping: "from the shopping list",
        planned: (sum: string) => `${sum} still planned`,
        add: "+ Expense",
        editTitle: "Edit expense",
        emptyTitle: "No expenses yet",
        emptyHint: "Add the first one — totals and the category breakdown build themselves.",
        deleteConfirm: "Delete this expense?",
        fieldTitle: "What for",
        titlePlaceholder: "Dinner by the sea",
        fieldAmount: "How much",
        fieldCurrency: "Currency",
        fieldCategory: "Category",
        fieldDate: "When",
        fieldBooking: "What it relates to",
        noBooking: "Nothing",
        fieldNote: "Note",
        currencySign: { THB: "฿", RUB: "₽", BYN: "Br", USD: "$" },
        currency: {
            THB: "Baht ฿",
            RUB: "Roubles ₽",
            BYN: "Bel. roubles Br",
            USD: "Dollars $",
        },
        category: {
            FLIGHT: "Flights",
            STAY: "Stay",
            TICKETS: "Tickets",
            FOOD: "Food",
            TRANSPORT: "Transport",
            SHOPPING: "Shopping",
            OTHER: "Other",
        },
    },
    errors: {
        stayBothDates: "Set both dates — arrival and departure",
        stayOrder: "The departure date is before the arrival",
        /** Показывается уже владельцу пробной поездки: сама поездка у
         *  него есть, платное — править её и вносить записи. */
        premium: "Editing a trip and adding entries come with a subscription",
        /** Пробный лимит: вторая поездка бесплатно не создаётся. */
        freeLimit: "One trip is free — more come with a subscription",
        fillTitleAndDates: "Fill in the title and both dates",
        endBeforeStart: "The end date is before the start date",
        tripNotFound: "Trip not found",
        ownerAlreadyIn: "The owner is already on the trip",
        fillTitleAndDate: "Fill in the title and the date",
        cannotEditOthers: "You can't edit someone else's entry",
        cannotDeleteOthers: "You can't delete someone else's entry",
        listNotFound: "List not found",
        todoTextRequired: "Type what needs doing",
        signInRequired: "You need to sign in",
        cannotEditOthersTodo: "You can't change someone else's to-do",
        flightNameRequired: "Enter the flight or airline",
        hotelNameRequired: "Enter the hotel name",
        bookingNotFound: "Booking not found",
        notFriend: "You can only invite your friends",
        expenseTitle: "Say what the money went on",
        expenseAmount: "Check the amount: it has to be a number above zero",
        badFile: "The file didn't pass the check — please upload it again",
    },
};
