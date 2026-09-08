export const communities = {
    metaTitle: "Communities",
    metaDescription:
        "Communities on MyBLHub: find people who watch the same shows and go to the same events.",
    heading: "Communities",
    eyebrow: "Together",
    intro: "Places to find people who love the same shows as you.",

    create: "Create a community",
    createTitle: "New community",
    titleLabel: "Name",
    titlePlaceholder: "Lakorn lovers club",
    descriptionLabel: "About the community",
    descriptionPlaceholder: "Who it is for and what happens inside.",

    coverLabel: "Cover",
    visibilityLabel: "Who can find it",
    visibility: {
        PUBLIC: "Anyone",
        PRIVATE: "By link only",
    },
    visibilityHint: {
        PUBLIC: "The cover page is open to everyone, including search engines. What is inside stays for members.",
        PRIVATE: "Not listed and not indexed: the page opens by direct link, and only members see anything inside.",
    },

    joinModeLabel: "Joining",
    joinMode: {
        OPEN: "Anyone can join",
        APPROVAL: "With the owner's approval",
    },

    tabs: {
        discussions: "Discussions",
        meetups: "Meetups",
        places: "Places",
        trips: "Trips",
        requests: "Requests",
    },
    members: "Members",
    membersCount: (n: number) => `${n} ${n === 1 ? "member" : "members"}`,
    requests: "Join requests",
    join: "Join",
    joinRequest: "Ask to join",
    pending: "Waiting for approval",
    leave: "Leave the community",
    leaveConfirm: "Leave this community?",
    accept: "Accept",
    decline: "Decline",
    remove: "Remove",
    removeConfirm: "Remove this person from the community?",
    owner: "Owner",
    moderator: "Moderator",

    linksTitle: "Links",
    linkLabel: "Title",
    linkUrl: "Link",
    addLink: "Add a link",
    deleteLink: "Remove the link",

    edit: "Edit",
    save: "Save",
    delete: "Delete the community",
    deleteConfirm: "Delete this community? Members and links will be gone for good.",

    /** Обложка: грузится и снимается сразу, отдельно от формы правки. */

    /** The page is open, but the inside is not — see communities.ts. */
    insideLockedHint: "Join to read the discussions and see meetup details.",
    privateTitle: "This community is private",
    privateHint: "You can get in by invitation from its owner.",

    emptyTitle: "No communities yet",
    emptyHint: "The first one is yours to create.",
    emptyMine: "You are not in any community yet.",
    myCommunities: "Mine",
    allCommunities: "All",

    /**
     * Привязки к каталогу и место (АА25). Свой подобъект: этот кусок
     * словаря правится вместе с привязками, а не с витриной.
     */
    /** Место сообщества и фильтр витрины по нему. Привязки к
     *  артистам и сериалам жили тут же, но владелец их отменила
     *  2026-09-09 — лимит мешал, а без лимита список превращался в
     *  свалку на странице артиста. */
    topics: {

        // Заголовка и пояснения над полями места больше нет (правка
        // владельца 2026-09-09): поля с примерами в плейсхолдерах
        // понятны сами, а абзац объяснял устройство витрины тому, кто
        // просто заводит сообщество.
        countryLabel: "Country",
        countryPlaceholder: "Thailand",
        cityLabel: "City",
        cityPlaceholder: "Bangkok",
        save: "Save",
        loading: "Loading…",

        /** Заголовок блока на странице артиста и сериала. */

        /** Фильтр по месту на витрине. */
        filterLabel: "Where",
        anyPlace: "Anywhere",
        wholeCountry: "The whole country",
        emptyPlaceTitle: "Nobody here yet",
        emptyPlaceHint: "Try another place — or start a community here yourself.",

        errors: {
            cityWithoutCountry:
                "A city needs a country — a community with a city alone would never be found",
        },
    },

    // Встречи сообщества (этап 3). Отдельный подобъект — этот кусок
    // словаря правится вместе с фичей встреч, а не с витриной.
    meetups: {
        heading: "Meetups",
        create: "Arrange a meetup",
        createTitle: "New meetup",
        editTitle: "Edit the meetup",
        emptyTitle: "No meetups yet",
        emptyHint: "The first one is yours — watching an episode together at someone's place counts.",
        emptyHintReadOnly: "Join the community to arrange meetups.",
        upcoming: "Coming up",
        past: "Past meetups",

        titleLabel: "What is happening",
        posterLabel: "Meetup picture",
        titlePlaceholder: "Watching episode 5 together",
        dateLabel: "Date",
        timeLabel: "Time",
        addressLabel: "Address",
        addressPlaceholder: "Street, building, entrance code",
        descriptionLabel: "Details",
        descriptionPlaceholder: "What to bring, how to get in, when to arrive.",
        dramaLabel: "Series (optional)",
        dramaNone: "Not linked",

        // Онлайн-встреча: переключатель в форме. Адресного поля при нём
        // нет — ссылку на созвон кладут в «Подробности», где её видят
        // только участники (в venue она уехала бы в карточку).
        onlineLabel: "Online meetup",
        onlineHint: "No address needed — leave the call or stream link in the details.",

        visibilityLabel: "Who sees this meetup",
        openToEveryone: "Show it to everyone",

        goingCount: (n: number) => `${n} going`,
        author: (who: string) => `Arranged by ${who}`,
        save: "Save",
        delete: "Delete the meetup",
        deleteConfirm: "Delete this meetup? The going marks will be gone with it.",

        /** Строка в блоке информации о событии — чтобы встречу не приняли
         *  за афишное событие; оговорка о закрытости — тихой добавкой. */
        eventCommunityLabel: "Community",
        eventOnlyMembers: "members only",
        /** То же целой фразой — для описания страницы в метадате. */
        eventNoticeMembers: "Only members of this community can see this page.",

        errors: {
            notMember: "Only members of the community can arrange meetups",
            titleRequired: "The meetup needs a name",
            venueRequired: "Say where it happens",
            dateRequired: "Pick a date for the meetup",
            notFound: "Meetup not found",
            forbidden: "A meetup can be edited by its author, the owner and the moderators",
        },
    },

    // Общие места сообщества («куда сходить в Минске»). Отдельный
    // подобъект по той же причине, что у встреч: этот кусок словаря
    // правится вместе с фичей мест, а не с витриной.
    places: {
        heading: "Places",
        intro: "Shared lists of the community: where to go together.",
        create: "New list",
        createTitle: "New community list",
        titleLabel: "Name",
        titlePlaceholder: "Where to go together",
        descriptionLabel: "What this list is about",
        descriptionPlaceholder: "Cafés and spots worth an evening together.",
        publicLabel: "Show the list to everyone",
        publicHint:
            "By default a list stays inside the community — only members see it. A closed community shows nothing outside either way.",
        creating: "Creating…",
        submit: "Create the list",
        createFailed: "Could not create the list — try again",

        membersOnly: "Members only",
        openToEveryone: "Open to everyone",
        // Счёт мест берём из словаря списков (t.lists.places.placeCount):
        // фраза одна и та же, а вторая копия склонений разъехалась бы.
        // Чей это список — там, где списки разных сообществ вперемешку
        // (каталог локаций, страница места).
        ofCommunity: (title: string) => `Community “${title}”`,

        // Каталог локаций: вкладка с местами из общих списков.
        catalogTab: "Community places",
        catalogIntro:
            "Places from shared lists: the communities you belong to, and open lists of public communities.",
        catalogEmptyHint:
            "A community list is visible to its members. Only open lists of public communities go outside.",
        // Страница места: в каких общих списках оно лежит.
        onLocation: "In community lists",

        emptyTitle: "No shared places yet",
        emptyHint:
            "Start a list — “where to go together”, “cafés from the series” — and fill it together.",
        emptyHintReadOnly: "The owner and the moderators keep the lists of this community.",

        errors: {
            forbidden: "Community lists are kept by the owner and the moderators",
            notFound: "Community not found",
            titleRequired: "The list needs a name",
        },
    },

    /** Обсуждения (этап 2): темы сообщества и комментарии к ним. */
    posts: {
        newTopic: "New topic",
        privateLabel: "Members only",
        privateBadge: "Members only",
        edit: "Edit",
        editTitle: "Edit the topic",
        save: "Save",
        titlePlaceholder: "Title (optional)",
        titleAria: "Topic title",
        // Вывеска темы без заголовка в закрытом виде вкладки: снаружи
        // текст темы не отдаётся вовсе (аудит 2026-09, п.1.4).
        untitled: "Untitled topic",
        textPlaceholder: "What do you want to talk about?",
        textAria: "Topic text",
        publish: "Post it",
        cancel: "Cancel",
        pinned: "Pinned",
        pin: "Pin to the top",
        unpin: "Unpin",
        deletePost: "Delete the topic",
        deletePostConfirm: "Delete this topic? Its comments go with it.",
        commentsCount: (n: number) => (n === 1 ? "1 comment" : `${n} comments`),
        /** Заголовок ленты на странице темы — там число уже не новость,
         *  оно стояло в строке списка, по которой человек и пришёл. */
        commentsHeading: "Comments",
        noComments: "No comments yet.",
        commentPlaceholder: "Write a comment…",
        commentAria: "Comment text",
        reply: "Reply",
        replyPlaceholder: (who: string) => `Reply to ${who}…`,
        replyAria: (who: string) => `Reply to ${who}`,
        send: "Send",
        deleteComment: "Delete the comment",
        deleteCommentConfirm: "Delete this comment?",
        emptyTitle: "No topics yet",
        emptyHint: "The first one is yours to start.",
        emptyHintReadOnly: "Join the community to write here.",
        errors: {
            notMember: "Only members of this community can write here",
            postNotFound: "This topic is gone",
            textRequired: "A topic needs some text",
            textTooLong: (n: number) => `The text is too long — up to ${n} characters`,
            commentRequired: "The comment is empty",
            commentTooLong: (n: number) => `The comment is too long — up to ${n} characters`,
            parentNotFound: "The comment you replied to is gone",
            cannotDelete: "You cannot delete this",
            cannotEdit: "You cannot edit this topic",
            cannotPin: "Only the owner and moderators can pin topics",
        },
    },

    /**
     * People of the community: roles, ban, invitations. Свой подобъект, а
     * не строки вперемешку с остальными: этот кусок словаря правится
     * отдельно от витрины и обсуждений, и общий плоский список ключей
     * превращался бы в место постоянных столкновений.
     */
    people: {
        invite: "Invite",
        inviteTitle: "Invite to the community",
        inviteHint:
            "An invitation is the only way into a private community. The person gets a notification and decides for themselves — nobody is enrolled silently.",
        inviteSearchPlaceholder: "Name or username",
        inviteFriends: "Your friends",
        inviteFound: "Search results",
        inviteNoFriendsLeft: "Everyone you are friends with is already here.",
        inviteSend: "Invite",
        inviteSearch: "Search",
        invited: "Invited, waiting for an answer",
        cancelInvite: "Cancel",
        // Блок участников в левой колонке показывает два ряда аватарок,
        // остальные — по этой кнопке, в модалке.
        seeAll: "See everyone",
        inviteBannerTitle: (who: string) => `${who} is inviting you to this community`,
        inviteBannerHint: "Accept and you are a member; decline and the invitation is gone.",

        makeModerator: "Make a moderator",
        removeModerator: "Dismiss the moderator",

        ban: "Remove",
        banConfirm: (who: string) =>
            `Remove ${who} from the community? They will not be able to join again on their own.`,
        bannedTitle: "Removed",
        bannedHint:
            "The row stays here on purpose: without it a removed person would simply join again. Lift the ban and they disappear from this list — and can come back.",
        unban: "Lift the ban",
        bannedNotice: "You were removed from this community.",

        /** Подпись тумблера в настройках Telegram — живёт здесь, а не в
         *  словаре аккаунта: повод про сообщества, и правится он вместе с
         *  остальными строками этой фичи. */
        tgToggle: "Communities: invitations and join requests",

        errors: {
            ownerOnly: "Only the owner appoints moderators",
            ownerBan: "The owner cannot be removed from their own community",
            moderatorBan: "Only the owner can remove a moderator",
            notMember: "This person is not a member of the community",
            alreadyIn: "This person is already in the community",
            inviteBanned: "This person was removed from the community — lift the ban first",
            noInvite: "There is no such invitation any more",
            banned: "You were removed from this community",
        },
    },

    /**
     * Медали самого СООБЩЕСТВА в левой колонке страницы (не личные
     * ачивки про сообщества — те живут в профиле). Свой подобъект: они
     * правятся вместе с блоком медалей, а не с витриной.
     */
    achievements: {
        title: "Achievements",
        emptyHint:
            "None yet — they come on their own: for the first meetup, the first members, a lively thread.",
        // Прогресс к БЛИЖАЙШЕЙ неполученной медали — одной: полный
        // список остаётся сюрпризом, поэтому дальние не называем.
    },

    /**
     * "Together": где сообщество встречается с остальным сайтом — блок
     * «из вашего сообщества идут» на странице события и «собрать
     * поездку» в самом сообществе. Свой подобъект по той же причине, что
     * и `meetups`/`people`: связки правятся вместе друг с другом, а не
     * вместе с витриной.
     */
    together: {
        going: "People from your communities are going",
        goingOne: "Someone from your community is going",

        tripButton: "Plan a trip",
        tripTitle: "A trip with the community",
        tripHint:
            "We will set up a shared trip and invite the people you pick — everyone else will not even know about it. An invitation is not enrolment: each of them decides for themselves.",
        tripMembers: "Who are you inviting",
        tripMembersPlaceholder: "Pick members…",
        tripNobody: "Nobody but you here yet — the trip will start out solo.",
        tripSubmit: "Create the trip",

        tripsHeading: "Community trips",
        tripsNote:
            "Only the trips you can open anyway: your own, the ones you were invited to, and the ones their owners opened up. A trip planned here does not become everyone's.",
        tripsPast: "Past trips",
        tripsEmptyTitle: "No trips yet",
        tripsEmptyHint: "Plan the first one — the day-by-day plan, bookings and shared to-dos come with it.",
        tripsEmptyHintReadOnly:
            "Either nobody has planned one yet, or you have not been invited: other people's trips are not listed here.",

        errors: {
            notMember: "Only members of the community can plan a trip from it",
        },
    },

    /** Месячная сводка владельцу сообщества (аудит 2026-09, раздел 8) —
     *  уходит в Telegram из sendCommunityMonthlySummaries. Строки живут
     *  здесь, а не в словаре уведомлений: это текст фичи сообществ. */
    monthlyDigest: {
        title: (community: string) => `"${community}" over the past month`,
        newMembers: (n: number) => `${n} new ${n === 1 ? "member" : "members"}`,
        posts: (n: number) => `${n} ${n === 1 ? "topic" : "topics"}`,
        comments: (n: number) => `${n} ${n === 1 ? "comment" : "comments"}`,
        nextMeetup: (what: string, when: string) => `Next meet-up: ${what} — ${when}`,
        footer:
            "A monthly recap for the community owner — switch it off with the “Communities” toggle in notification settings.",
    },

    errors: {
        premium: "Creating communities is part of the subscription.",
        titleRequired: "The community needs a name",
        limit: (n: number) => `You can run up to ${n} communities`,
        notFound: "Community not found",
        noRequest: "There is no such request any more",
        ownerLeave: "The owner cannot leave their own community — delete it instead",
        linkRequired: "A link needs a title and an address",
        linkUrl: "The link must start with http:// or https://",
        coverUrl: "That cover could not be saved — upload the picture again",
    },
};
