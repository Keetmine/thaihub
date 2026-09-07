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

    errors: {
        premium: "Creating communities is part of the subscription.",
        titleRequired: "The community needs a name",
        limit: (n: number) => `You can run up to ${n} communities`,
        notFound: "Community not found",
        noRequest: "There is no such request any more",
        ownerLeave: "The owner cannot leave their own community — delete it instead",
        linkRequired: "A link needs a title and an address",
        linkUrl: "The link must start with http:// or https://",
    },
};
