export const communities = {
    metaTitle: "Communities",
    metaDescription:
        "Communities on MyBLHub: find people who watch the same shows and go to the same events.",
    heading: "Communities",
    eyebrow: "Together",
    intro: "Places to find people who watch the same shows as you.",

    create: "Create a community",
    createTitle: "New community",
    titleLabel: "Name",
    titlePlaceholder: "Lakorns Belarus",
    descriptionLabel: "About the community",
    descriptionPlaceholder: "Who it is for and what happens inside.",

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
        members: "Members",
        requests: "Requests",
    },
    soon: "Coming soon.",
    members: "Members",
    membersCount: (n: number) => `${n} members`,
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
    cover: {
        title: "Cover",
        hint: "A wide picture, 3:2 — you can move and zoom it before saving.",
        upload: "Add a cover",
        replace: "Replace the cover",
        remove: "Remove the cover",
        uploading: "Uploading…",
    },

    /** The page is open, but the inside is not — see communities.ts. */
    insideLockedTitle: "Members only",
    insideLockedHint:
        "Members, links and meetups are visible after you join — meetups have addresses and private chats behind them.",
    privateTitle: "This community is private",
    privateHint: "You can get in by invitation from its owner.",

    emptyTitle: "No communities yet",
    emptyHint: "The first one is yours to create.",
    emptyMine: "You are not in any community yet.",
    myCommunities: "Mine",
    allCommunities: "All",

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
        titlePlaceholder: "Watching episode 5 together",
        dateLabel: "Date",
        timeLabel: "Time",
        timeHint: "Leave empty while the time is not settled.",
        venueLabel: "Where",
        venuePlaceholder: "At Katya's place",
        addressLabel: "Address",
        addressPlaceholder: "Street, building, entrance code",
        descriptionLabel: "Details",
        descriptionPlaceholder: "What to bring, how to get in, when to arrive.",
        dramaLabel: "Series (optional)",
        dramaNone: "Not linked",

        visibilityLabel: "Who sees this meetup",
        openToEveryone: "Show it to everyone",
        openHint:
            "By default a meetup stays inside the community: its address is someone's home. Open it up and it goes into the events feed as well.",
        onlyMembersBadge: "Members only",
        openBadge: "Open to everyone",

        goingCount: (n: number) => `${n} going`,
        author: (who: string) => `Arranged by ${who}`,
        openPage: "Meetup page",
        save: "Save",
        delete: "Delete the meetup",
        deleteConfirm: "Delete this meetup? The going marks will be gone with it.",

        /** Плашка на странице самой встречи — чтобы её не приняли за афишу. */
        eventNotice: (community: string) => `Meetup of the “${community}” community`,
        eventNoticeMembers: "Only members of this community can see this page.",

        /** Блок открытых встреч в афише. */
        inEventsHeading: "Community meetups",
        inEventsHint: "Arranged by people here, not by promoters.",

        errors: {
            notMember: "Only members of the community can arrange meetups",
            titleRequired: "The meetup needs a name",
            venueRequired: "Say where it happens",
            dateRequired: "Pick a date for the meetup",
            notFound: "Meetup not found",
            forbidden: "A meetup can be edited by its author, the owner and the moderators",
        },
    },

    /** Обсуждения (этап 2): темы сообщества и комментарии к ним. */
    posts: {
        newTopic: "Start a topic",
        newTopicHint: "Members will see it in their notifications on the site.",
        titlePlaceholder: "Title (optional)",
        titleAria: "Topic title",
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
        inviteEmpty: "Nobody found",
        inviteNoFriendsLeft: "Everyone you are friends with is already here.",
        inviteSend: "Invite",
        inviteSearch: "Search",
        invited: "Invited, waiting for an answer",
        cancelInvite: "Cancel",
        inviteBannerTitle: (who: string) => `${who} is inviting you to this community`,
        inviteBannerHint: "Accept and you are a member; decline and the invitation is gone.",

        makeModerator: "Make a moderator",
        removeModerator: "Dismiss the moderator",
        moderatorHint:
            "A moderator answers join requests, invites people and removes them. Settings, visibility and deletion stay with the owner.",

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
