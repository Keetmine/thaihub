// Юридические страницы и справка. Пункты документов — отдельными
// ключами, а не массивом: так забытый абзац ловится типом, а не
// молча укорачивает документ на другом языке.
export const legal = {
    eyebrow: "Documents",
    about: {
      metaTitle: "About",
      metaDescription:
        "MyBLHub — a tracker of the actors' concerts and fan events: the event feed, artist and series profiles, favourites and watch statuses.",
    },
    terms: {
      metaTitle: "Terms of use",
      metaDescription:
        "MyBLHub terms of use: what a subscription gives you, how it is paid for, refunds and the rules of the service.",
      title: "Terms of use",

      whatTitle: "What MyBLHub is",
      whatText:
        "MyBLHub is a service for fans of series and their artists: a feed of concerts and fan meets, a catalogue of actors and series, filming locations, trip planning and reminders in Telegram. Part of the catalogue is open to everyone; the event feed and the personal sections are available with a subscription.",

      subscriptionTitle: "Subscription and payment",
      subscriptionAccess:
        "A subscription opens up the event feed, the calendar, trips, place lists and notifications for 30 days from the moment of payment.",
      subscriptionOneOff:
        "Payment is one-off. There is no automatic renewal — when the term runs out the subscription simply ends, and no money is charged again.",
      subscriptionHow:
        "For now a subscription is enabled by promo code or by arrangement — write to us from the subscription page. If payment inside Telegram (Telegram Stars) is switched on, it happens entirely on Telegram's side: we neither receive nor store bank card details.",
      subscriptionPromo:
        "A promo code, if you have one, is activated on the subscription page and adds the corresponding number of months.",

      refundTitle: "Refunds",
      refundText:
        "If a subscription has been paid for and the service does not work the way it was promised, write to us within 14 days of the payment — we will refund it in full. A Telegram Stars refund is issued by Telegram's own means to the same account the payment came from; the subscription ends at that point.",

      catalogueTitle: "Catalogue content",
      catalogueText:
        "Data about series, actors and events is collected from open sources, which are named on the entry pages in the “Sources” block. If you are a rights holder and want material removed or credited to its author, write to us through the contact form — we will reply and put it right within seven days.",

      rulesTitle: "Rules of use",
      rulesRespect: "Do not post insults, spam or other people's personal data.",
      rulesImpersonation:
        "Do not pass yourself off as other people — neither as actors nor as other users.",
      rulesEnforcement:
        "Accounts that break these rules may be restricted without a refund of the payment for the remaining term.",

      dataTitle: "Data",
      dataText:
        "We store what the service needs in order to work: the account (email, Google or Telegram), favourites, “going” marks, trips and notes. The privacy settings in your profile control what other users see. What data we collect, which services receive it (analytics, error reports, Telegram) and how to delete an account —",
      dataLink: "in the privacy policy",

      languageTitle: "The language of this document",
      languageText:
        "This is a translation, provided so that the terms can be read in English. The Russian version is the binding one: where the two differ, the Russian text applies.",

      contactTitle: "Getting in touch",
      contactText: "Questions, refunds and complaints — through the",
      contactLink: "contact form",
      contactOr: "or with the",
      contactBot: "command in the bot.",
    },
    privacy: {
      metaTitle: "Privacy policy",
      metaDescription:
        "What data MyBLHub collects, what for, which services are used and how to delete your data.",
      title: "Privacy policy",

      operatorTitle: "Who processes the data",
      operatorText:
        "MyBLHub (myblhub.com) is run by a self-employed individual in the Republic of Belarus. We are the operator of your data — the party that decides what the site collects and what it is used for. You can get in touch with us through the",
      operatorLink: "contact form",
      operatorOr: "or with the",
      operatorBot:
        "command in the Telegram bot — we answer questions about data the same way as any others.",

      collectTitle: "What data we collect",
      collectAccount:
        "The account: email and password (only its hash is stored) — or a Google or Telegram identifier if you sign in with those; name, handle, profile photo.",
      collectProfile:
        "The optional profile: country, gender, date of birth, “about you” — you fill these in if you want to, and you may leave them empty.",
      collectActivity:
        "What you do on the site: favourites, “going” and “watched” marks, notes, comments and reviews, trips, lists, uploaded files of tickets and bookings.",
      collectTechnical:
        "Technical data: the session cookie for signing in; the IP address is used only at the moment of the request, to protect against brute-forcing passwords, and is not saved in the database.",

      whyTitle: "What for",
      whyText:
        "So that the service works: signing in to the account, your saved events and trips, reminders in Telegram, replies to your messages. We use depersonalised visit statistics to understand which sections people use. Data is not sold and is not passed to anyone for advertising.",

      cookiesTitle: "Cookies",
      cookiesNecessary:
        "Necessary: the session cookie (signing in to the account) and the record of your own choice in the cookie banner. The site does not work without them.",
      cookiesAnalytics:
        "Analytics (Yandex.Metrica): these are only set after you have pressed “Accept all” in the banner. You can change that choice by deleting the site's cookies in your browser — the banner will appear again.",

      servicesTitle: "Which services receive data",
      servicesMetrica:
        "Yandex.Metrica (Russia) — depersonalised visit statistics and a recording of what happens on the page (Webvisor). Only with your consent in the cookie banner.",
      servicesSentry:
        "Sentry (servers outside Belarus and Russia) — automatic reports about site errors, so that we can fix them. Screen recording at the moment of an error — only with consent to analytics.",
      servicesTelegram:
        "Telegram — if you have linked your account: the bot sends you notifications by your id.",
      servicesGoogle: "Google — only if you sign in with a Google account.",
      servicesCrossBorder:
        "Some of these services operate outside Belarus and Russia — that is, a cross-border transfer of data takes place, and it is necessary for the site to work.",

      retentionTitle: "How long we keep data and how to delete it",
      retentionText:
        "Data is kept for as long as you have an account. You can delete the account yourself in settings (the “Security” tab) — the email and the linked logins are released, and the profile is depersonalised. On request through the",
      retentionLink: "contact form",
      retentionAfter:
        "we will tell you what data about you we keep, or correct anything inaccurate.",

      publicFiguresTitle: "Data about public figures",
      publicFiguresText:
        "The catalogue of actors and groups is put together from open sources (they are named in the “Sources” block on the entry pages). If you are the actor yourself or their representative and want something removed or corrected, write to us.",

      changesTitle: "Changes",
      changesText:
        "If the policy changes in substance, we will note it here. The current version is dated",
      changesDate: "22 August 2026",

      languageTitle: "The language of this document",
      languageText:
        "This is a translation, provided so that the policy can be read in English. The Russian version is the binding one: where the two differ, the Russian text applies.",
    },
    help: {
      metaTitle: "Help",
      metaDescription:
        "Answers to common questions about MyBLHub: the catalogue of series and artists, the event feed, filming locations, trips, communities, profiles, the subscription, privacy, import and export.",
      eyebrow: "Reference",
      title: "Help",

      intro:
        "Common questions about how the site works, grouped by section. If the answer is not here, the question can be sent through the feedback form.",
      tocTitle: "Sections",
      anchorLabel: "Link to this question",

      /** Подписи ссылок под ответом. Отдельным разделом, а не внутри
       *  каждого ответа: одна и та же страница упоминается в пяти
       *  вопросах, и пять её имён разъехались бы. */
      linkLabels: {
        series: "Series",
        artists: "Artists",
        novels: "Novels",
        events: "Event feed",
        calendar: "Calendar",
        locations: "Filming locations",
        map: "Map of locations",
        places: "My places",
        artistLists: "Artist lists",
        trips: "Trips",
        communities: "Communities",
        friends: "Friends",
        notifications: "Notifications",
        profile: "My profile",
        settings: "Settings",
        search: "Search",
        signup: "Create an account",
        login: "Sign in",
        wiki: "Wiki",
        terms: "Terms of use",
        privacyPolicy: "Privacy policy",
        subscribe: "About the subscription",
      },

      topics: {
        start: {
          title: "Getting started",
          what: {
            q: "What is MyBLHub?",
            a: "MyBLHub is a site about Thai series and the people who make them. It holds a catalogue of series, novels, actors, groups and agencies, a feed of concerts and fan meets, real filming locations, a trip planner and a profile with statistics on what has been watched and attended. Some sections are open to everyone, others come with a subscription.",
          },
          account: {
            q: "Do I need an account?",
            a: "Not for reading: the catalogue, the filming locations and event pages are open without signing in. An account is needed for marking things — watch statuses, “I'm going”, favourites, trips, lists and reviews are all tied to it.",
          },
          first: {
            q: "What happens after signing up?",
            a: "Sign-up is followed by a three-step setup: a handle, which becomes the address of the profile, an import of a MyDramaList watch list, and a choice of favourite artists. A short tour of the sections comes next; it can be restarted from settings.",
          },
          find: {
            q: "How do I find a series, an artist or an event?",
            a: "The search box in the header suggests series, artists, events, places and novels as you type. The search page groups the results by section, agencies and wiki articles included, and adds filters: year, genres, country, type, status, tags and agency for series; type and agency for artists; dates, venue and tags for events. Filters are written into the page address, so a link to a filtered result can be shared.",
          },
          wiki: {
            q: "What is the wiki?",
            a: "The wiki is a section of guides about series, tickets and travel. It is open to everyone; no account or subscription is required.",
          },
        },

        catalog: {
          title: "Series, artists, novels",
          mine: {
            q: "Why does the series section show so few titles?",
            a: "For a signed-in visitor the series section shows their own list — the series they have given a status to — with columns sorted by clicking a heading. The search box on the same page runs across the whole catalogue.",
          },
          status: {
            q: "How do I mark a series as watched?",
            a: "The status button sits on the series page and next to the title in any list. The statuses are “Watching now”, “Watched”, “On hold”, “Plan to watch” and “Dropped”, with a personal star rating alongside. A series with a status goes into the personal list and into the profile; no subscription is required.",
          },
          episodes: {
            q: "How do I keep count of watched episodes?",
            a: "An episode counter appears on any series with a status — on the series page, in the series list, in the profile and on the “Watching now” card on the home page. Marking the last episode of a finished series moves it to “Watched”, and lowering the count returns it to “Watching now”. For a series still airing the status is not changed automatically.",
          },
          bell: {
            q: "How do I hear about a new episode?",
            a: "The series page has a bell next to the status button — that is the subscription to new episodes. The notification arrives on the site, and in the bot as well if Telegram is linked. Setting “Watching now” turns the bell on automatically.",
          },
          reviews: {
            q: "How do I leave a review and a rating?",
            a: "Series, novels and events that have already taken place carry a reviews block: an overall score out of ten, optional per-aspect scores, the text of the review and comments below it. One review per entry, editable later. A review marked private is visible only to its author and does not count towards the average score.",
          },
          artistsList: {
            q: "Why is an artist missing from the list?",
            a: "The people tab shows favourites and those with events in the feed by default — the full list would run to thousands of rows. Search by name covers the whole catalogue, and the tabs above switch between individual people, groups, mascots and agencies.",
          },
          artists: {
            q: "What is on an actor's page, and what does the heart do?",
            a: "A person's page holds a photo, the known facts, series and films, music, awards and upcoming events; an agency page lists its roster. The heart adds the person to favourites: they are pinned to the top of the list, their events appear under the “My artists” tab in the feed, and a birthday reminder is sent.",
          },
          seenLive: {
            q: "What does the eye icon on an artist's page mean?",
            a: "It is the “seen live” mark. It is set automatically for artists of past events marked as attended, meet-ups inside a trip included, and can be switched either way by hand. The “I'm going” mark on the event itself is not affected.",
          },
          novels: {
            q: "Are the novels the series are based on here?",
            a: "Novels have their own section with a search, a page each, reviews and comments. Watch statuses and the episode counter exist for series only.",
          },
          missing: {
            q: "A series or an actor is missing from the catalogue — what now?",
            a: "A request to add it is sent through the feedback form on this page. The catalogue is compiled from open sources, listed under “Sources” on every entry page.",
          },
        },

        events: {
          title: "Events and the calendar",
          what: {
            q: "What is the event feed?",
            a: "The feed lists concerts, fan meets and festivals with dates, venue, line-up, ticket price and a link to where tickets are sold. Without a subscription the two nearest events and any individual event page are open in full. A subscription opens the whole feed: the “All”, “I'm going”, “Favourites” and “My artists” tabs, search by title, a date range and the archive of past events.",
          },
          going: {
            q: "How do I mark that I'm going to a concert?",
            a: "The mark is set with the “I'm going” button on the event card or a date chip on the event page, and it applies to a specific date. What is marked appears in the profile, in the calendar, in the plan of a trip covering those dates and in the calendar subscription, and counts towards statistics once the event has passed. Marking attendance is part of the subscription; favourites are available to any signed-in visitor.",
          },
          calendar: {
            q: "Is there a monthly calendar of events?",
            a: "The calendar shows a full month in four views: all events, your own, artists' birthdays and episode air dates. Clicking a date opens that day on its own page. The section requires a subscription.",
          },
          ics: {
            q: "How do I add events to Google or Apple Calendar?",
            a: "In two ways, both part of the subscription. The “Add to calendar” button on an event page downloads a file for that single event. Settings hold a permanent subscription link that Google and Apple Calendar re-read on their own, so new “I'm going” marks appear there without further action. The link can be replaced with a new one at the press of a button.",
          },
          presale: {
            q: "How do I not miss the start of ticket sales?",
            a: "When an event has a presale date, a reminder arrives an hour before it opens, and the event page offers a button that adds that moment to a calendar. The reminder requires a linked Telegram account and an active subscription.",
          },
          tickets: {
            q: "Where do I keep bought tickets?",
            a: "The event page has a row under the header for each marked date; a PDF or a photo of the ticket is attached there. The file is private and opens only for its owner. The same row records the time online seat booking opens, with a reminder an hour beforehand.",
          },
          friends: {
            q: "How do I see which friends are going to an event?",
            a: "An event row shows the number of friends going, and the event page shows them as cards. Subscribers are notified when a friend marks an event; notifications from one particular person can be muted on their profile.",
          },
        },

        places: {
          title: "Filming locations and your own places",
          locations: {
            q: "Where do I find the filming locations of a series?",
            a: "In the locations section: real addresses where series were filmed and where events are held, with a photo, the district, coordinates and the series shot there. It offers an A-to-Z list, grouping by series, filtering by category and a shared map. Most of the data comes from open sources, named under “Sources” on every page.",
          },
          visited: {
            q: "How do I mark a place as visited?",
            a: "The “Mark as visited” button is on the place page, in lists of places and on a series page. Visited places count towards profile statistics and are pinned on the map there. The mark requires no subscription.",
          },
          own: {
            q: "Can I add a place of my own?",
            a: "Yes, with “+ Add a place” in the “My places” section; creating one requires an active subscription. A name and a Google Maps link or bare coordinates are enough — the point is worked out automatically. An own place appears in personal places, lists and trips and never in the shared catalogue.",
          },
          lists: {
            q: "What are lists of places and artists for?",
            a: "A list is a shareable set of places or artists. Visibility is chosen per list: private, friends-only or public — a public list opens without an account. Lists of places can be attached to a trip and are drawn on its map. Lists of places are created in “My places” and lists of artists in your own profile; creating them requires a subscription, while existing lists stay available without one.",
          },
        },

        trips: {
          title: "Trips",
          what: {
            q: "What is a trip?",
            a: "A trip is a page built around a set of dates that gathers everything falling inside them: marked events from the feed, personal meet-ups and flights, hotel and travel bookings, a to-do list, a packing list, a shopping list and places. The section requires a subscription.",
          },
          create: {
            q: "How do I create a trip?",
            a: "With the “+ Create a trip” button in the trips section: a name, the dates and the visibility. Friends can be picked in the same form — they receive an invitation and become participants once they accept.",
          },
          shared: {
            q: "How do I invite someone to a shared trip?",
            a: "Only people who are already friends can be invited. The invitation arrives in notifications and in Telegram; once accepted, a participant adds events, bookings, to-dos and places on equal terms with the author, provided their own subscription is active. Any participant can leave a trip and take a copy of the plan with them.",
          },
          stay: {
            q: "What if participants travel on different dates?",
            a: "Every participant has a “My dates” button that sets the period they are actually there. The trip itself stays a single trip, while arrival markers appear in the plan on the right days, showing from which date participants overlap. The “days in Thailand” statistic counts personal dates rather than the whole trip.",
          },
          lists: {
            q: "What are the packing and shopping lists in a trip?",
            a: "Two lists inside a trip, next to the to-do list: a tick box on each item and a packed or bought counter above. The packing list is private by default and separate for each participant in a shared trip, while the shopping list is open to participants. Neither takes dates; to-dos do, and a dated to-do stands in the plan on its day.",
          },
          bookings: {
            q: "How do I add a hotel and flights to a trip?",
            a: "As a booking entry: a name, dates with times, an address or a route, a link and a confirmation file. In the plan a booking takes two rows — check-in and check-out, departure and arrival — collapsing into one when nothing stands between them. The address, the note, the link and the file stay available to trip participants only, even when the booking itself is open more widely.",
          },
        },

        communities: {
          title: "Communities",
          what: {
            q: "What is a community?",
            a: "A community is a page for a group of people, with discussions, its own meetups, shared trips and lists of places. Public communities are gathered in a separate section with filtering by country and city, and they also appear on the pages of the artists and series they are linked to.",
          },
          create: {
            q: "How do I create a community?",
            a: "With the “Create community” button in the communities section; it requires an active subscription. The form asks for a name, a description, the visibility (open to everyone or by link only) and the joining rule (open or on approval). One person can hold no more than three communities. Only creating is paid: joining, reading and taking part require no subscription.",
          },
          join: {
            q: "How do I join a community?",
            a: "A public community has a “Join” button on its page. If approval is on, a request is sent and the decision is reported either way. A private community is entered by invitation, which arrives as a notification and as a banner on the community page with “Accept” and “Decline” buttons. Nobody is added to a community without agreeing to it.",
          },
          outside: {
            q: "What is visible in a community without joining?",
            a: "From outside, every community shows its cover, name, description, location and member count. A public one adds the titles of its topics and meetup cards carrying nothing but a date. The contents of topics, meetup addresses, the member list and the community's links are open to members only, and a topic marked private is not visible from outside at all. In a private community the tabs do not open at all.",
          },
          discussions: {
            q: "What are community discussions?",
            a: "Discussions are topics inside a community: the title is optional and up to three photos can be attached to the text. Replies are comments, with their own replies and likes. The owner and moderators pin a topic to the top of the list. A new topic arrives as a notification on the site; only a reply to your own comment is repeated in Telegram.",
          },
          meetups: {
            q: "What are community meetups?",
            a: "A meetup is the community's own event. Any member can create one; the author edits their own and the owner and moderators edit any. The card works like one in the event feed, with an “I'm going” mark, comments and a calendar export. Meetups are visible to members only and never reach the general feed, the calendar, search or statistics; they are gathered on the community tab and on the “Communities” tab in the event feed.",
          },
          trips: {
            q: "How do I organise a trip from a community?",
            a: "The “Trips” tab has a “Plan a trip” button: it creates an ordinary shared trip and sends invitations to the chosen members. The button requires a subscription, because the trips section is paid throughout. The tab lists only the trips the viewer is entitled to open by their visibility.",
          },
          places: {
            q: "Does a community have shared lists of places?",
            a: "Yes, on the “Places” tab: the same format as a personal list, with the map, the notes and the visited mark. The owner and moderators keep them, and no subscription is needed for that inside a community. A new list is visible to members by default; the “show to everyone” checkbox opens it outward only in a public community. A place itself stays with whoever added it.",
          },
          roles: {
            q: "Who runs a community?",
            a: "The owner: they appoint and remove moderators, change the visibility and the joining rules and delete the community; leaving one's own community is not possible. A moderator handles join requests, invites people, edits the name, description, cover and catalogue links, pins topics and keeps the lists of places.",
          },
          ban: {
            q: "How do I remove a member from a community?",
            a: "The owner and moderators can remove a member; this is a ban on rejoining that holds until it is lifted. The member's role is reset and any pending invitation is cancelled. The owner cannot be removed, and a moderator only by the owner.",
          },
          achievements: {
            q: "What are the badges on a community page?",
            a: "They are the community's own achievements: meetups held, member count, topics and comments, a trip put together, a shared list of places and the community's age. They are counted for the community rather than for a person and are shown to members; there is no notification for a new one. Personal achievements for taking part in communities appear in the profile with the rest.",
          },
          report: {
            q: "Where do I report a topic or a comment?",
            a: "A topic page and every comment written by someone else carry a “Report” button, and the report goes to the site administration. The owner and moderators can also remove content inside the community. A complaint about the community itself is sent through the feedback form on this page.",
          },
        },

        profile: {
          title: "Profile, friends, notifications",
          profile: {
            q: "What does the profile show?",
            a: "The profile is a single page for its owner and for visitors: photo, handle, friends, badges and the tabs “Overview”, “Statistics”, “Series”, “Events”, “Communities”, “Trips”, “Places”, “Tickets”, “Reviews” and “Comments”. The “Tickets” tab is visible to the owner only. The open tab is reflected in the address, so a link to it can be copied and sent.",
          },
          stats: {
            q: "What do the profile statistics count?",
            a: "Events attended, artists seen live, days spent in Thailand, series finished with their episode and hour counts, a breakdown by year and a map of visited places. Everything is derived from marks already made, with nothing extra to fill in. The statistics tab requires a subscription.",
          },
          achievements: {
            q: "How are badges earned?",
            a: "Badges unlock automatically once the statistics cross a threshold, and a notification announces each new one. They appear in the profile under the photo, with a description in the tooltip. The full list of badges is not published in advance.",
          },
          friends: {
            q: "How do I add a friend?",
            a: "In the friends section a person is found by name, handle or exact email address, after which a request is sent. Friends see the profile regardless of the privacy switches, and by the same rule its trips and lists open for them. Only friends can be invited on a trip.",
          },
          notifications: {
            q: "What are notifications sent about?",
            a: "Friend requests, trip invitations, replies and likes on comments, new episodes of followed series, birthdays of favourite artists, friends marking events, new badges and the opening of online seat booking. Everything collects in the bell in the header.",
          },
          telegram: {
            q: "How do I connect Telegram notifications?",
            a: "Settings → Profile → the Telegram block: signing in through the widget links the account. Start has to be pressed in the bot once afterwards, because Telegram does not let a bot write first. Which notifications are repeated in the bot is set with the switches in the same block.",
          },
        },

        premium: {
          title: "Subscription",
          gives: {
            q: "What does a subscription give?",
            a: "The full event feed with its filters, search and archive; the calendar and day pages; trips; the personal features around an event — “I'm going” marks, tickets, friends going, notes, the presale reminder and the calendar export; statistics and badges in the profile; and creating own places, lists of places, lists of artists and communities.",
          },
          free: {
            q: "What works without a subscription?",
            a: "The catalogue of series, artists, groups, agencies and novels in full, watch statuses, ratings and the episode counter, reviews and comments, favourites, filming locations and the map, visited marks, friends, notifications, taking part in communities, the MyDramaList import and the export of personal data. In the event feed the two nearest events and any individual event page are open. Places and lists created earlier stay available as well.",
          },
          pay: {
            q: "How do I subscribe?",
            a: "A subscription runs for 30 days and is paid in one go; there is no automatic renewal. Payment goes through Telegram (Stars) or by arrangement, which is set up through the feedback form. A promo code is redeemed in the same block and adds the corresponding number of months.",
          },
          expire: {
            q: "What happens when a subscription runs out?",
            a: "A reminder arrives in Telegram three days before the end, if the account is linked. Nothing is deleted: trips, lists, statuses and marks are kept and open again once the subscription is renewed. Exporting personal data works without a subscription as well.",
          },
        },

        privacy: {
          title: "Privacy",
          profile: {
            q: "Who can see my profile?",
            a: "Friends see the profile regardless of the settings. For everyone else there are four switches in settings: hide the activity entirely, or hide badges, favourite artists and visited places separately. Email, tickets and private reviews are visible to the owner only.",
          },
          trip: {
            q: "Who can see a trip?",
            a: "A trip has three levels of visibility: private, friends-only and public — a public one opens by link for anyone, including visitors without an account. Personal entries, bookings and to-dos inside are shown to participants only, even in a public trip; each entry has its own visibility and can never be more open than the trip around it.",
          },
          review: {
            q: "How do I leave a private review?",
            a: "The review form has a “Private review” checkbox. Such a review is visible to its author only — neither on the entry page nor in the profile — and is left out of the average score.",
          },
          data: {
            q: "What data does the site keep about a user?",
            a: "What the service needs to work: the account, the marks made on the site, trips and notes. The list of collected data, the third-party services involved and the retention periods are described in the privacy policy. An account can be deleted from the “Security” tab in settings.",
          },
        },

        data: {
          title: "Import and export",
          mdl: {
            q: "How do I import a list from MyDramaList?",
            a: "Settings → “Import and export”: paste the link to a public list in the form mydramalist.com/dramalist/handle, copied from the address bar; a profile's display name will not do. Statuses, episode progress and ratings are transferred. The import never rolls progress back: the higher episode count wins, a status is not downgraded and a rating is written only into an empty field. Running it again tops up the same data. No subscription is required.",
          },
          mdlMissing: {
            q: "Why were some series not found during the import?",
            a: "Series that were not found are saved as a request to add them to the catalogue. Once such a series appears in the catalogue, the status is filled in automatically and a notification announces it.",
          },
          export: {
            q: "How do I export my data?",
            a: "Settings → “Import and export”: the export returns six CSV files — series, events, trips, trip entries, artists and places. The files open in Excel and Google Sheets. No subscription is required for the export.",
          },
        },
      },

      feedbackTitle: "Write to us",
      feedbackHint:
        "A question about the site, a correction, or a request to add a series or an actor.",
      searchContext: (query: string) => `Search: “${query}”`,
    },
    cookies: {
      ariaLabel: "We use cookies",
      text: "We use cookies: necessary ones — for signing in and running the site, and analytics ones (Yandex.Metrica) — to understand what people use. More detail —",
      link: "in the privacy policy",
      acceptAll: "Accept all",
      necessaryOnly: "Necessary only",
    },
};
