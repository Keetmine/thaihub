import type { Dict } from "../en";

export const trips: Dict["trips"] = {
    eyebrow: "Планирование",
    paywallFeature: "Поездки",

    /** Список поездок: /trips */
    list: {
        metaTitle: "Поездки",
        metaDescription: "Ваши поездки и совместные планы.",
        title: "Мои поездки",
        intro:
            "Поездка — это даты, когда вы в Таиланде: на её странице собраны все события, попадающие в этот период.",
        invites: "Приглашения",
        invitedBy: (name: string) => `приглашает ${name}`,
        someFriend: "друг",
        emptyTitle: "Пока нет ни одной поездки",
        emptyHint:
            "Создайте поездку с датами — события, отели и списки мест соберутся в один план.",
        pastHeading: "Прошедшие",
        shared: "совместная",
        sharedSuffix: " · совместная",
        organiser: (name: string) => `Организатор: ${name}`,
        noName: "без имени",
    },

    /** Страница поездки: /trips/[id] */
    detail: {
        back: "← Все поездки",
        ofUser: (name: string) => `Поездка пользователя ${name} →`,
        ofFriend: "Поездка друга →",
        inviteBanner: (name: string) =>
            `${name} приглашает вас в эту поездку — вы будете видеть общий план и сможете добавлять свои события и дела.`,
        someone: "Пользователь",
        tabPlan: (n: number) => `План (${n})`,
        tabMyPlan: (n: number) => `Мой план (${n})`,
        tabEvents: (n: number) => `Афиша (${n})`,
        tabTodos: (n: number) => `Дела (${n})`,
        tabPlaces: "Что посетить",
        onlyMine: "Только моё",
        deleteTrip: "Удалить поездку",
        deleteConfirm: (title: string) => `Удалить поездку «${title}»?`,

        emptyPlanTitle: "В плане пока пусто",
        emptyPlanHintOwn:
            "Отметьте «я иду» на событиях (вкладка «Афиша») или добавьте личное — перелёт, бронь, встречу.",
        emptyPlanHintGuest: "Участники ещё ничего не добавили в план.",
        emptyEventsTitle: "В эти даты событий нет",
        emptyEventsHint: "В даты этой поездки не попадает ни одно событие из афиши.",
    },

    /** Форма создания и редактирования поездки. */
    form: {
        open: "+ Создать поездку",
        createTitle: "Новая поездка",
        editTitle: "Редактировать поездку",
        editAria: "Редактировать поездку",
        title: "Название",
        titlePlaceholder: "Бангкок, октябрь",
        from: "С даты",
        to: "По дату",
        members: "С кем едете (участники видят план и могут добавлять свои события)",
        membersPlaceholder: "Выберите друзей…",
        creating: "Создаём…",
        submitCreate: "Создать",
        saving: "Сохранение…",
        createFailed: "Не удалось создать поездку — попробуйте ещё раз",
        saveFailed: "Не удалось сохранить — попробуйте ещё раз",
    },

    /** Кто видит поездку. */
    visibility: {
        label: "Кто видит поездку",
        aria: "Видимость поездки",
        options: {
            PRIVATE: "Приватная",
            FRIENDS: "Для друзей",
            PUBLIC: "Публичная",
        },
        hints: {
            PRIVATE: "видите только вы",
            FRIENDS: "видят ваши друзья",
            PUBLIC: "видят все по ссылке",
        },
    },

    /** Кто видит отдельную запись поездки — дело, личное событие, бронь. */
    itemVisibility: {
        label: "Кто это видит",
        options: {
            PRIVATE: "Только я",
            PARTICIPANTS: "Участники поездки",
            FRIENDS: "Мои друзья",
            PUBLIC: "Все",
        },
        hints: {
            PRIVATE: "больше никто — даже те, кто едет с вами",
            PARTICIPANTS: "все, кто едет с вами",
            FRIENDS: "ваши друзья, если поездка им видна",
            PUBLIC: "все, кому видна поездка",
        },
        cappedBy: {
            FRIENDS: "Сама поездка видна только друзьям — шире записи внутри не открыть.",
            PRIVATE:
                "Сама поездка приватная — то, что внутри, видите только вы и те, кто едет с вами.",
        },
        badges: {
            PRIVATE: "только я",
            FRIENDS: "друзьям",
            PUBLIC: "всем",
        },
    },

    /** Личные события внутри поездки. */
    personal: {
        addLabel: "+ Личное событие",
        addShort: "+ Событие",
        addTitle: "Личное событие",
        editTitle: "Редактировать событие",
        adding: "Добавляем…",
        addFailed: "Не удалось добавить событие — попробуйте ещё раз",
        saveFailed: "Не удалось сохранить — попробуйте ещё раз",
        badge: "личное",
        performers: "Артисты на событии",
        performersHint:
          "Кого вы там увидите — после даты события они попадут в «видела вживую», если стоит «я там буду».",
        performersPlaceholder: "Начните вводить имя…",
        deleteConfirm: (title: string) => `Удалить «${title}»?`,
        attachmentOf: (title: string) => `Вложение к записи «${title}»`,
        file: "Файл ↗",

        title: "Название",
        titlePlaceholder: "Ужин с друзьями",
        date: "Дата",
        time: "Время",
        note: "Заметка",
        image: "Картинка",
        attending: "Я там буду",
        showOnHome: "Показывать на главной",
        editableByOthers: "Участники поездки могут редактировать и удалять",
    },

    /** Поле выбора места в форме личного события. */
    placePicker: {
        label: "Место (необязательно)",
        remove: "убрать",
        namePlaceholder: "Название места",
        nameAria: "Название нового места",
        mapsPlaceholder: "Ссылка Google Maps или «13.75, 100.50»",
        mapsAria: "Ссылка Google Maps или координаты",
        creating: "Создаём…",
        createAndPick: "Создать и выбрать",
        searchPlaceholder: "Начните вводить название локации…",
        ownPlace: "+ Своё место",
        nameRequired: "Укажите название места",
        createFailed: "Не удалось создать место — проверьте ссылку и попробуйте ещё раз",
    },

    /** Участники совместной поездки. */
    members: {
        button: (n: number) => `Участники (${n})`,
        title: "Участники поездки",
        noName: "Без имени",
        owner: "организатор",
        pending: "приглашение отправлено",
        cancelInviteConfirm: (name: string) => `Отменить приглашение для ${name}?`,
        removeConfirm: (name: string) => `Убрать ${name} из поездки?`,
        someFriend: "друга",
        someMember: "участника",
        removeAria: "Убрать из поездки",
        addFriend: "Добавить друга…",
        addFailed: "Не удалось добавить — попробуйте ещё раз",
        noFriendsLeft:
            "Добавлять в поездку можно друзей — все друзья уже здесь или их пока нет.",
        leaveConfirm: "Выйти из поездки?",
        leave: "Покинуть поездку",
        hint:
            "Друг получит приглашение и станет участником, когда примет его. Участники видят план, дела и личные события поездки и могут добавлять свои. Чужие записи можно менять, только если автор разрешил это галочкой.",
        accept: "Принять",
        decline: "Отклонить",
    },

    /** Вкладка «Что посетить». */
    places: {
        attachAria: "Прикрепить список",
        attachOption: "+ Прикрепить список…",
        detach: "Открепить",
        removeAria: "Убрать место",
        addButton: "+ Место",
        addTitle: "Добавить место",
        addPlaceholder: "+ Добавить место…",
        searchLabel: "Найдите в каталоге или среди своих мест",
        ownPlace: "+ Своё место",
        ownPlaceSubmit: "Создать и добавить в поездку",
        standalone: "Отдельные места",
        emptyGuestTitle: "Пока здесь пусто",
        emptyGuestHint: "Участники ещё не добавили места в эту поездку.",
        emptyTitle: "Мест пока нет",
        emptyHint:
            "Создайте своё место по ссылке Google Maps, найдите готовое или прикрепите список — здесь соберётся, что посетить в поездке.",
    },

    /** Дела поездки. */
    todos: {
        markUndone: "Отметить невыполненным",
        markDone: "Отметить выполненным",
        addButton: "+ Дело",
        addTitle: "Новое дело",
        editAria: "Редактировать дело",
        deleteAria: "Удалить дело",
        deleteConfirm: "Удалить дело?",
        editTitle: "Редактировать дело",
        text: "Что сделать",
        newText: "Новое дело",
        newPlaceholder: "Купить симку, обменять деньги…",
        dateOptional: "Дата (необязательно)",
        time: "Время",
        editableByOthers: "Участники поездки могут редактировать и удалять",
        editableByOthersShort: "Участники могут редактировать и удалять",
        emptyTitle: "Дел пока нет",
        emptyHintOwn: "Добавьте первое по кнопке — купить билеты, обменять деньги, собрать мерч.",
        emptyHintGuest: "Участники пока ничего не добавили.",
    },

    /** Жильё и перелёты. */
    bookings: {
        undatedHeading: "Жильё и перелёты без дат",
        addHotel: "+ Отель",
        addFlight: "+ Перелёт",
        hotelTitle: "Бронь отеля",
        flightTitle: "Перелёт",
        hotelName: "Отель *",
        flightName: "Рейс или авиакомпания *",
        namePlaceholder: "Название",
        from: "Откуда",
        fromPlaceholder: "Москва",
        to: "Куда",
        toPlaceholder: "Бангкок",
        departure: "Вылет",
        departureTimeAria: "Время вылета",
        arrival: "Прилёт",
        arrivalTimeAria: "Время прилёта",
        time: "Время",
        address: "Адрес",
        addressPlaceholder: "Улица, район",
        checkIn: "Заезд",
        checkInTimeAria: "Время заезда",
        checkOut: "Выезд",
        checkOutTimeAria: "Время выезда",
        stayUntil: (date: string) => `до ${date}`,
        stayFrom: (date: string) => `с ${date}`,
        nights: (n: number) => {
            // 1 ночь, 2–4 ночи, 5–20 ночей; десятки считаются по
            // последней цифре, кроме 11–14.
            const tail = n % 100;
            const last = n % 10;
            if (tail >= 11 && tail <= 14) return `${n} ночей`;
            if (last === 1) return `${n} ночь`;
            if (last >= 2 && last <= 4) return `${n} ночи`;
            return `${n} ночей`;
        },
        ticketUrl: "Ссылка на билет",
        bookingUrl: "Ссылка на бронь",
        ticketFile: "Файл билета",
        bookingFile: "Файл брони",
        note: "Заметка",
        flightNotePlaceholder: "Место, багаж, номер брони",
        hotelNotePlaceholder: "Код брони, этаж, во сколько заселение",
        ticketLink: "Билет ↗",
        bookingLink: "Бронь ↗",
        link: "Ссылка ↗",
        editFlight: "Редактировать перелёт",
        editBooking: "Редактировать бронь",
        deleteFlight: "Удалить перелёт",
        deleteBooking: "Удалить бронь",
        deleteConfirm: (name: string) => `Удалить «${name}»?`,
    },

    /** Ответы серверных экшенов — их показывают формы поездки. */
    errors: {
        premium: "Поездки доступны по подписке",
        fillTitleAndDates: "Заполните название и обе даты",
        endBeforeStart: "Дата окончания раньше даты начала",
        tripNotFound: "Поездка не найдена",
        ownerAlreadyIn: "Владелец уже в поездке",
        fillTitleAndDate: "Заполните название и дату",
        cannotEditOthers: "Нельзя редактировать чужую запись",
        cannotDeleteOthers: "Нельзя удалить чужую запись",
        listNotFound: "Список не найден",
        todoTextRequired: "Введите текст дела",
        signInRequired: "Требуется вход",
        cannotEditOthersTodo: "Нельзя менять чужое дело",
        flightNameRequired: "Укажите рейс или авиакомпанию",
        hotelNameRequired: "Укажите название отеля",
        bookingNotFound: "Бронь не найдена",
    },
};
