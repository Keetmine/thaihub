/**
 * «Мои места»: свои места, списки-подборки мест и пользовательские
 * списки актёров.
 */
export const lists = {
    eyebrow: "Planning",
    /** Подпись на пейволле: «Подписка открывает …». */
    paywallFeature: "adding your own places and lists",

    /** Раздел «Мои места»: /lists */
    places: {
        metaTitle: "My places",
        metaDescription:
            "Your own places in Thailand: cafés and filming spots from the series you want to reach. A place can stand on its own, and a list groups a shortlist to share with friends.",
        title: "My places",
        intro:
            "Save the places you want to reach: cafés, filming spots from the series, shops. A place stands on its own — a list is only for grouping places into a shortlist.",
        addPlace: "+ Add a place",
        emptyTitle: "No places yet",
        emptyHint:
            "Add your first one: paste a Google Maps link and it lands on the map straight away. Lists come later, when you want to group places and share a shortlist.",
        listsHeading: "Lists",
        listsIntro:
            "A list is a way to group places and share the shortlist: open it to friends or attach it to a trip.",
        placeCount: (n: number) => (n === 1 ? "1 place" : `${n} places`),
    },

    /** Страница списка мест: /lists/[id] */
    detail: {
        back: "← My places",
        visibilityAria: "List visibility",
        deleteList: "Delete list",
        deleteConfirm: (title: string) => `Delete the list "${title}"?`,
        ofUser: (name: string) => `${name}'s list →`,
        ofDeleted: "A deleted account's list →",
        emptyTitle: "No places in this list yet",
        emptyHintOwn: "Find a location with the search above and add it — or create your own.",
        emptyHintGuest: "The owner hasn't added any places yet.",

        addPlaceholder: "Add a place — start typing a name…",
        addAria: "Add a place to the list",
        searching: "Searching…",
        moveUp: "Move up",
        moveDown: "Move down",
        noteAria: "Note about this place",
        notePlaceholder: "What made this place memorable",
        noteOk: "OK",
        addNote: "+ note",
        editPlaceAria: "Edit place",
        removeFromList: "Remove from list",
        noteSaveFailed: "Couldn't save the note",
    },

    /** Кто видит список мест. */
    visibility: {
        PRIVATE: "Private",
        FRIENDS: "Friends only",
        PUBLIC: "Public",
    },

    /** Форма создания и редактирования списка мест. */
    form: {
        create: "+ New list",
        createTitle: "New place list",
        editTitle: "Edit list",
        title: "Title",
        titlePlaceholder: "Where the food is good",
        description: "Description",
        visibility: "Who can see the list",
        creating: "Creating…",
        submitCreate: "Create",
        saving: "Saving…",
        createFailed: "Couldn't create the list — try again",
        saveFailed: "Couldn't save — try again",
    },

    /** Форма своего места — она же в поездке. */
    placeForm: {
        open: "+ Create your own place",
        submitToList: "Create and add to the list",
        submitPlain: "Create place",
        createTitle: "New place",
        editTitle: "Edit place",
        name: "Name",
        namePlaceholder: "The café with the mango rice",
        maps: "Google Maps link or coordinates",
        mapsPlaceholder: "https://maps.app.goo.gl/… or 13.7563, 100.5018",
        mapsHint:
            "Paste the Share link from Google Maps — the coordinates are picked up automatically and the place lands on the map. Short links take a few seconds longer.",
        mapsUpdate: "Google Maps link or coordinates (if the pin needs updating)",
        category: "Category",
        categoryNone: "not set",
        photo: "Photo",
        photoOptional: "Photo (optional)",
        note: "Note",
        notePlaceholder: "the mango rice is a must",
        creating: "Creating…",
        createFailed: "Couldn't create the place — check the link and try again",
        saveFailed: "Couldn't save — check the link and try again",
    },

    /** Списки актёров: /artist-lists/[id] */
    artists: {
        metaTitle: "Artist list",
        metaNotFound: "This list doesn't exist.",
        metaDescription: (title: string) => `"${title}" — a fan-made list of actors on MyBLHub.`,
        back: "← My lists",
        visibilityAria: "Who can see the list",
        visibility: {
            PRIVATE: "Private",
            FRIENDS: "Friends only",
            PUBLIC: "Public",
        },
        deleteList: "Delete list",
        deleteConfirm: (title: string) => `Delete the list "${title}"?`,
        ofUser: (name: string) => `${name}'s list →`,
        ofDeleted: "A deleted account's list →",
        emptyTitle: "No one in this list yet",
        emptyHintOwn: "Add the first actor with the search above.",
        emptyHintGuest: "The owner hasn't added any actors yet.",
        removeAria: (name: string) => `Remove ${name}`,

        create: "+ New list",
        createLong: "+ New actor list",
        createTitle: "New actor list",
        editTitle: "Edit list",
        title: "Title",
        titlePlaceholder: "Drank beer",
        description: "Description",
        submitCreate: "Create",

        addPlaceholder: "Start typing an actor's name…",
        addAria: "Add an actor to the list",
        searching: "Searching…",
        nobodyFound: "No one found",
    },

    /** Ответы серверных экшенов — их показывают формы раздела. */
    errors: {
        /** Создание своего места или списка — платное (правка
         *  владельца 2026-09-06); смотреть чужие публичные списки
         *  можно и без подписки. */
        premium: "Your own places and lists come with a subscription",
        listTitleRequired: "Give the list a title",
        listNotFound: "List not found",
        placeNameRequired: "Give the place a name",
        signInToAddPlaces: "Sign in to add places",
        placeCreateFailed: "Couldn't create the place",
        placeNotFound: "Place not found",
        signInRequired: "You need to sign in",
    },
};
