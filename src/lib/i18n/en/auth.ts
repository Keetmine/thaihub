export const auth = {
    login: {
      metaTitle: "Sign in",
      metaDescription:
        "Sign in to your account: favourite artists, “going” marks, the calendar and your trips — all where you left them.",
      title: "Sign in",
      telegramError: "Couldn't sign you in with Telegram — please try again",
      googleError: "Couldn't sign you in with Google — please try again",
      wrongCredentials: "Wrong email or password",
      rateLimited: "Too many attempts — please wait a few minutes",
      email: "Email",
      password: "Password",
      forgot: "Forgot your password?",
      submit: "Sign in",
      google: "Sign in with Google",
      or: "or",
      noAccount: "No account yet?",
      signupLink: "Sign up",
    },
    signup: {
      metaTitle: "Sign up",
      metaDescription:
        "Create an account: a couple of fields — and you can mark events in the feed, keep watch statuses and plan trips.",
      title: "Sign up",
      emailTaken: "That email is already registered",
      invalid: "Check your email and password (6 characters minimum)",
      name: "Name",
      email: "Email",
      password: "Password",
      accept: "I accept the",
      // Ссылки на документы склоняются по-разному в двух местах:
      // в чекбоксе «принимаю условия», в сноске — «соглашаетесь с условиями».
      terms: "terms",
      privacy: "privacy policy",
      and: "and",
      oauthNotice: "By signing in with Google or Telegram you agree to our",
      termsWith: "terms",
      privacyWith: "privacy policy",
      submit: "Sign up",
      google: "Continue with Google",
      or: "or",
      haveAccount: "Already have an account?",
      loginLink: "Sign in",
    },
    forgot: {
      metaTitle: "Password recovery",
      metaDescription:
        "Forgot your password? Give us the email on the account — we'll send a link you can set a new one with.",
      title: "Forgot your password?",
      lead: "Give us the email on the account — we'll send a reset link.",
      email: "Email",
      submit: "Send the link",
      sending: "Sending…",
      sent: "If an account like that exists, an email with the link is already on its way. Check your inbox (and the spam folder).",
      smtpDown: "Automatic reset is temporarily unavailable — write to us through the",
      smtpFormLink: "contact form",
      smtpAfter: " — we'll sort it out by hand.",
      backToLogin: "← Back to sign in",
    },
    resetEmail: {
      subject: "Password reset — MyBLHub",
      body: (link: string) =>
        `To set a new password, follow this link (valid for one hour):\n\n${link}\n\nIf you didn't ask for a reset, just ignore this email.`,
    },
    reset: {
      metaTitle: "New password",
      metaDescription:
        "The link from the email is good for a limited time: set a new password and you're straight back into your account.",
      title: "New password",
      invalidLink: "This link is invalid or has expired —",
      invalidLinkCta: "ask for another reset",
      passwordLabel: "Choose a password",
      submit: "Save and sign in",
      /** Ответы серверного экшена resetPassword. */
      tooShort: "The password is too short — at least 6 characters",
      linkInvalid: "This link is invalid or has expired — ask for another reset",
    },
    password: {
      show: "Show password",
      hide: "Hide password",
    },
    // Экран /banned. Причину блокировки здесь НЕ показываем — она
    // служебная, для админа (решение владельца): человеку сообщаем факт
    // и канал, по которому можно ответить.
    banned: {
      metaTitle: "Access closed",
      eyebrow: "Access closed",
      title: "Your account is blocked",
      lead: "You can no longer sign in or post here. Everything you wrote earlier is still in place — we haven't erased it.",
      contactTitle: "Think this is a mistake?",
      contactLead:
        "Write to us and we'll take another look. Leave an email address so we have somewhere to reply.",
      logout: "Sign out",
    },
    welcome: {
      metaTitle: "Who do you love?",
      metaDescription:
        "Step three of the setup: mark your favourite artists so the “My artists” tab and your favourites work from day one.",
      eyebrow: "Welcome",
      title: "Who do you love?",
      lead: "Pick your favourite artists — their events will show up in the “My artists” tab, and your favourites will fill up from day one. You can change this at any point.",
      searchLabel: "Can't find yours? Search by name:",
      searchPlaceholder: "Start typing a name…",
      submit: "Save and go to the feed",
      skip: "Skip and go to the feed →",
    },
    profileSetup: {
      metaTitle: "A little about you",
      metaDescription:
        "First step after signing up: pick a handle — it doubles as your profile address — and tell us about yourself if you feel like it. You can change it whenever.",
      eyebrow: "Step 1 of 3",
      title: "A little about you",
      lead: "The handle is what your profile link is built from — that's how people add you as a friend. The rest is up to you.",
      usernameLabel: "Handle *",
      usernameHint:
        "This is the link friends will find you by. Latin letters, digits, dot, hyphen or underscore.",
      nameLabel: "Name",
      namePlaceholder: "How to show you on the site",
      countryLabel: "Country",
      countryEmpty: "not set",
      genderLabel: "Gender",
      genderEmpty: "not set",
      genderFemale: "female",
      genderMale: "male",
      genderOther: "other",
      birthLabel: "Date of birth",
      bioLabel: "About you",
      bioPlaceholder:
        "Favourite actors and series, how many concerts you've been to, what you're here for",
      submit: "Continue",
      saving: "Saving…",
      laterHint: "Everything except the handle can be filled in later in settings.",
      saveFailed: "Couldn't save — please try again",
      usernameRequired: "Pick a handle",
      usernameInvalid:
        "Handle: 2–24 characters, Latin letters, digits, dot, hyphen or underscore",
      usernameReserved: "That handle is reserved by the system, pick another",
      usernameTaken: "That handle is already taken",
    },
};
