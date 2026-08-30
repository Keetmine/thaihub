// Юридические страницы и справка. Пункты документов — отдельными
// ключами, а не массивом: так забытый абзац ловится типом, а не
// молча укорачивает документ на другом языке.
export const legal = {
    eyebrow: "Documents",
    about: {
      metaTitle: "About",
      metaDescription:
        "MyBLHub — a tracker of concerts and fan events for Thai actors: the event feed, artist and series profiles, favourites and watch statuses.",
    },
    terms: {
      metaTitle: "Terms of use",
      metaDescription:
        "MyBLHub terms of use: what a subscription gives you, how it is paid for, refunds and the rules of the service.",
      title: "Terms of use",

      whatTitle: "What MyBLHub is",
      whatText:
        "MyBLHub is a service for fans of Thai BL series: a feed of concerts and fan meets, a catalogue of actors and series, filming locations, trip planning and reminders in Telegram. Part of the catalogue is open to everyone; the event feed and the personal sections are available with a subscription.",

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
        "How to use MyBLHub and how to write to us if something is missing.",
      eyebrow: "Reference",
      title: "Help",

      whatTitle: "What is this site?",
      whatText:
        "MyBLHub is a tracker of concerts and fan events for Thai actors: a schedule of events, artist and series profiles, favourites and watch statuses.",

      favouritesTitle: "How do I add someone to favourites?",
      favouritesText:
        "Press the heart icon next to an artist, a series or an event. Everything you favourite collects in your",
      favouritesLink: "profile",

      goingTitle: "How do I mark that I'm going to an event?",
      goingText:
        "On the event page press “I'm going” — the event will show up in the “My events” section of your profile.",

      friendsTitle: "Friends",
      friendsBefore: "In the",
      friendsLink: "“Friends”",
      friendsAfter:
        "section you can find other users by name or email and send them a friend request.",

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
