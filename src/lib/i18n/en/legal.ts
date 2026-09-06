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
        "What MyBLHub can do and how to use it: the catalogue, the event feed, trips, your profile, the subscription, privacy, import and export.",
      eyebrow: "Reference",
      title: "Help",

      intro:
        "Questions we get asked most often, grouped by section. Open the one you need — or write to us if the answer is not here.",
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
            q: "What is this site for?",
            a: "MyBLHub keeps track of Thai series and the people who make them. There is a catalogue of series, novels, actors, groups and agencies; a feed of concerts and fan meets; the real places where series were filmed; a trip planner; and a profile that counts what you have watched and been to. Part of it is open to everyone, part comes with a subscription.",
          },
          account: {
            q: "Do I need an account?",
            a: "Not to look around: the catalogue, the filming locations and event pages open without signing in. An account is what lets you mark things — watch statuses, “I'm going”, favourites, trips, lists and reviews are all tied to it.",
          },
          first: {
            q: "I have just signed up — what now?",
            a: "We walk you through three steps: pick a handle (it becomes the address of your profile), bring your watch list over from MyDramaList if you keep one, and choose a few artists to follow. After that a short tour points out the sections. You can take the tour again from settings whenever you like.",
          },
          find: {
            q: "How do I find something specific?",
            a: "The search box in the header looks through events, artists, series, novels, agencies, places and wiki articles at once and groups the results by section. Pick a section on the search page and the filters appear: year, genres, country, type and agency for series; who they are and which agency for artists; dates and tags for events. Filters live in the address, so a link to a filtered result can be sent to someone.",
          },
          wiki: {
            q: "What is the wiki?",
            a: "Guides we write ourselves: how tickets are bought, where to fly, what is worth watching. It is open to everyone, with or without an account.",
          },
        },

        catalog: {
          title: "Series, artists, novels",
          mine: {
            q: "Why does the series section only show a handful of titles?",
            a: "Because once you are signed in it is your list, not the whole catalogue: it holds the series you have given a status to, sorted by the columns you click. Everything else is one search away — type a title into the box on that page and the search runs across the whole catalogue.",
          },
          status: {
            q: "How do I mark a series as watched?",
            a: "Every series has a status button — on its own page and next to it in any list. The statuses are “Watching now”, “Watched”, “On hold”, “Plan to watch” and “Dropped”. Setting one adds the series to your list here and to your profile. Statuses are free, no subscription needed.",
          },
          episodes: {
            q: "Can I keep count of the episodes?",
            a: "Yes — once a status is set, a counter appears («5 of 22») on the series page, in the catalogue list and on the “Watching now” card on the home page. The counter moves the status by itself: mark the last episode of a finished series and it goes to “Watched”, take one back and it returns to “Watching now”. A series still airing is left alone, so it does not disappear from your list while you wait for more.",
          },
          bell: {
            q: "How do I hear about a new episode?",
            a: "There is a bell next to the status button on the series page. While it is lit you get “episode 5 of 10 is out” — in the notification bell here, and in Telegram if you have linked it. Setting “Watching now” switches the bell on for you.",
          },
          reviews: {
            q: "Can I rate something and leave a review?",
            a: "Series, novels and events all have a reviews block: a score out of ten with a few words about why, and comments underneath. One review per person per entry, editable later. A review can be marked private — then only you see it, and it does not count towards the average score.",
          },
          artistsList: {
            q: "Why is the artist I am looking for not in the list?",
            a: "The list you land on holds your favourites plus the people who have events coming up — otherwise it would be thousands of rows deep. Search by name and you get the whole catalogue; the tabs above switch between individual people, groups, mascots and agencies.",
          },
          artists: {
            q: "What is on a person's page, and what does the heart do?",
            a: "A photo, the facts we know, the series and films they appeared in, their music, their awards and their upcoming events; an agency page lists everyone on its roster. The heart adds them to your favourites: they get pinned to the top of the list, their events show up under the “My artists” tab in the feed, and we remind you on their birthday.",
          },
          seenLive: {
            q: "What is the eye icon on an artist's page?",
            a: "It means “seen live”. Anyone who performed at an event you marked as attended — in the feed or as a meet-up inside a trip — turns up with the eye already lit. Pressing it overrides that either way, including switching it off: five people on stage, and you only really saw two. Your “I'm going” mark on the event itself is not affected.",
          },
          novels: {
            q: "Are the novels the series are based on here too?",
            a: "Yes, they have their own section with a search, a page each and the same reviews and comments. Watch statuses are for series only — novels do not have them.",
          },
          missing: {
            q: "A series or a person is missing from the catalogue",
            a: "Write to us with the form at the bottom of this page — we add things by request. The catalogue is put together from open sources, and every entry page names them in the “Sources” block.",
          },
        },

        events: {
          title: "Events and the calendar",
          what: {
            q: "What is in the event feed?",
            a: "Concerts, fan meets and festivals: dates, venue, line-up, ticket price and a link to where tickets are sold. The next couple of events and every individual event page are open to everyone; the whole feed — the “All / I'm going / Favourites / My artists” tabs, search by title, a date range and the archive — comes with a subscription.",
          },
          going: {
            q: "How do I mark that I'm going?",
            a: "The “I'm going” button on the event card, or the date chips on the event page. The mark goes on a specific date, so on a two-day concert you can pick just the Saturday. What you mark shows up in your profile, in the calendar, in the plan of a trip covering those dates and in your calendar subscription — and after the event it counts towards your statistics. Marking events is part of the subscription; the heart, which just saves an event for later, is free.",
          },
          calendar: {
            q: "Is there a month view?",
            a: "The calendar shows a month at a time, with four views: all events, just the ones you are going to, artists' birthdays and episode air dates. Clicking a day opens that day on its own page. The calendar is part of the subscription.",
          },
          ics: {
            q: "Can these events go into my own calendar?",
            a: "Two ways, both part of the subscription. On an event page, “Add to calendar” downloads a file for that one event. In settings there is a permanent subscription link: Google or Apple Calendar re-reads it by itself, so everything you newly mark as “I'm going” simply appears there. If the link ends up somewhere it shouldn't, one button replaces it with a new one.",
          },
          presale: {
            q: "How do I not miss the start of ticket sales?",
            a: "When an event has a presale date, we send a reminder an hour before it opens, and the page has an “Add to calendar” button for that moment. You need a linked Telegram account and an active subscription for the reminder.",
          },
          tickets: {
            q: "Where do I keep the ticket I bought?",
            a: "On the event page, right under the header, there is a row for each date you are going to — attach the PDF or a photo there. The file is private: nobody else can open it. The same row is where you note the time online seat booking opens, and we remind you an hour before.",
          },
          friends: {
            q: "Can I see which of my friends are going?",
            a: "Event rows carry a “N friends going” line, and the event page shows them as cards. When a friend marks an event, a notification comes your way; if one particular friend is too active about it, there is a mute button on their profile.",
          },
        },

        places: {
          title: "Filming locations and your own places",
          locations: {
            q: "What is the locations section?",
            a: "Real places: where series were filmed and where events are held — a photo, the district, coordinates and the series shot there. Browse them A to Z, group them by series, narrow them down by category (cafés, restaurants, shops, viewpoints…) or open them all at once on the map. Most of it comes from open sources, named on each page under “Sources”.",
          },
          visited: {
            q: "How do I mark that I have been somewhere?",
            a: "“Mark as visited” on the place page, and the same button on the rows in the list, on a series page and inside a list of places. Visited places are counted in your profile statistics and pinned on the map there.",
          },
          own: {
            q: "Can I add a place of my own?",
            a: "Yes — “+ Add a place” in the “My places” section. Give it a name and a Google Maps link (short or long) or bare coordinates, and we work out the point. A place you add is yours alone: it appears in your places, lists and trips, and never in the shared catalogue.",
          },
          lists: {
            q: "What are lists for?",
            a: "A list is a set you can share — places («where to eat», «cafés from the series»), or artists («seen live»). Each list is private, friends-only or open by link, and a public one opens for people without an account too. Lists of places can be attached to a trip, so everything you wanted to get to is on one map. Lists of artists are created from your own profile and need a subscription; the ones you already have stay yours either way.",
          },
        },

        trips: {
          title: "Trips",
          what: {
            q: "What is a trip here?",
            a: "Your dates — and everything that falls inside them: the events you marked “I'm going” to, your own meet-ups and flights, hotel and flight bookings, a to-do list, a packing list, a shopping list, and the places you want to get to. It all sits on one page instead of five different notes. Trips come with a subscription.",
          },
          create: {
            q: "How do I create one?",
            a: "The “+ Create a trip” button on the trips page: a name and the dates. In the same form you can pick the friends you are going with — they become participants straight away.",
          },
          shared: {
            q: "How do I invite someone?",
            a: "You can invite people who are already your friends here. The invitation reaches them in their notifications and in Telegram, and once accepted they add events, bookings, to-dos and places exactly as you do. Anyone can leave a trip themselves — and take a copy of it with them if they want to keep the plan.",
          },
          stay: {
            q: "We are flying on different dates — how does that work?",
            a: "Everyone has their own “My dates” button: you say when you are actually there. The trip stays one trip — same hotel, same plan — and the timeline gets “✈ you arrive” markers on the right days, so it is obvious from which day you overlap. Your “days in Thailand” statistic counts your own dates, not the whole trip.",
          },
          lists: {
            q: "What are the packing and shopping lists?",
            a: "Two lists inside a trip, next to the to-do list: a tick box each and a “N of M packed” line above. The packing list is private by default — in a shared trip everyone packs their own suitcase — while shopping is shared with the participants. Neither takes a date; to-dos do, and a dated to-do stands in the plan on its day.",
          },
          bookings: {
            q: "Where do the hotel and the flights go?",
            a: "Add them as bookings: a name, dates with times, the address or the route, a link and the confirmation file. In the plan a booking sits as two entries — check-in and check-out, departure and arrival — on the days they actually happen. The address, the note, the link and the file stay with you and the people travelling with you even if you open the booking itself to a wider audience.",
          },
        },

        profile: {
          title: "Profile, friends, notifications",
          profile: {
            q: "What is on my profile page?",
            a: "One page, the same one other people see: photo, handle, friends, badges, and tabs for the overview, statistics, reviews, comments, series, events, trips, places and your tickets. The address bar follows the open tab, so a link to one particular tab can be copied and sent.",
          },
          stats: {
            q: "What does the statistics tab count?",
            a: "Events you have been to, artists seen live, days spent in Thailand, series finished with the episode and hour count, a breakdown by year, and a map of the places you have visited. It is all worked out from marks you already make — there is nothing extra to fill in. The statistics tab comes with a subscription.",
          },
          achievements: {
            q: "Where do the badges come from?",
            a: "They unlock on their own once the same statistics cross a threshold, and a notification tells you about a new one. They live under the photo on your profile as icons; hover one to read what it is for. Which badges exist we deliberately keep as a surprise.",
          },
          friends: {
            q: "How do I add a friend?",
            a: "In the friends section, find someone by name, handle or exact email and send a request. Friends see your profile in full, whatever your privacy switches say, and their trips and lists open for you by the same rule. Only friends can be invited on a trip.",
          },
          notifications: {
            q: "What do you send notifications about?",
            a: "Friend requests, trip invitations, replies and likes on your comments, new episodes of series you follow, birthdays of your favourite artists, a friend marking an event, a new badge, and the opening of online seat booking. Everything lands in the bell in the header.",
          },
          telegram: {
            q: "How do I connect Telegram?",
            a: "Settings → Profile → the Telegram block: signing in through the widget links the account. Press Start in the bot once — Telegram does not let bots write first. Which of the notifications above are also sent to the bot is up to you, with the switches in the same block.",
          },
        },

        premium: {
          title: "Subscription",
          gives: {
            q: "What does a subscription give me?",
            a: "The whole event feed with its filters, search and archive; the calendar and the day pages; trips; everything personal around an event — “I'm going”, your tickets, friends going, notes, the presale reminder and the calendar export; the statistics and badges on your profile; and creating new artist lists.",
          },
          free: {
            q: "And what works without one?",
            a: "The catalogue of series, artists, groups, agencies and novels in full, watch statuses and the episode counter, reviews and comments, favourites, filming locations and the map, your own places and lists of places, friends, notifications, the MyDramaList import and the export of your own data.",
          },
          pay: {
            q: "How do I subscribe?",
            a: "A subscription runs for 30 days and is paid once — there is no automatic renewal, and when the term ends nothing is charged again. Payment goes through Telegram (Stars) or by arrangement: write to us and we will sort it out. A promo code, if you have one, is redeemed on the same screen.",
          },
          expire: {
            q: "What happens when it runs out?",
            a: "We remind you three days before in Telegram, if it is linked. Nothing is deleted: trips, lists, statuses and marks stay where they are and open up again the moment the subscription is renewed. Exporting your own data works with or without one.",
          },
        },

        privacy: {
          title: "Privacy",
          profile: {
            q: "Who can see my profile?",
            a: "Friends see everything, always. For everyone else there are four switches in settings: hide the activity entirely, or hide just the badges, the favourite artists or the visited places. Your email, your tickets and your private reviews are only ever visible to you.",
          },
          trip: {
            q: "Who can see a trip?",
            a: "A trip is private, friends-only, or public — a public one opens by link for anyone, including people without an account. Inside it, personal entries, bookings and to-dos are shown to the participants only, even in a public trip; each entry has its own visibility setting, and it can never be more open than the trip around it.",
          },
          review: {
            q: "Can I write a review just for myself?",
            a: "Tick “Private review” in the form. Nobody else sees it — not on the page, not in your profile — and it stays out of the average score.",
          },
          data: {
            q: "What data do you keep about me?",
            a: "What the site needs to work: the account, the marks you make, trips and notes. The details — which services receive anything and how long it is kept — are in the privacy policy. You can delete the account yourself in settings.",
          },
        },

        data: {
          title: "Import and export",
          mdl: {
            q: "I already keep a list on MyDramaList",
            a: "Settings → “Import and export”: paste the link to your public list — the mydramalist.com/dramalist/<handle> address, copied from the address bar. A profile's display name will not do; the handle in the address is the one that works. Statuses and episode progress come across, and the list wins over what was here before. Running it again just refreshes the same statuses. Free, no subscription needed.",
          },
          mdlMissing: {
            q: "Some of my series were not found",
            a: "They are not lost: we save them as a request. When such a series makes it into the catalogue, your status is filled in automatically and a notification tells you it has arrived.",
          },
          export: {
            q: "Can I take my data with me?",
            a: "Settings → “Import and export”: six CSV files — series, events, trips, trip entries, artists and places. They open in Excel and Google Sheets as they are. No subscription needed: getting your own data out should always work.",
          },
        },
      },

      feedbackTitle: "Write to us",
      feedbackHint:
        "A question, an idea, or a series or actor we are missing — write to us, we read every message.",
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
