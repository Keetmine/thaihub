/**
 * Импорт списка просмотра с MyDramaList — блок в настройках аккаунта
 * (вкладка «Import», src/app/(public)/account/settings/).
 */
export const mdlImport = {
  tab: "Import",
  title: "Import from MyDramaList",
  intro:
    "Enter your MyDramaList nickname or a link to your public list — we will copy your watch statuses (Watching, Watched, On hold, Plan to watch, Dropped) and episode progress over here.",
  inputLabel: "Nickname or list link",
  inputPlaceholder: "keetmine or https://mydramalist.com/dramalist/keetmine",
  submit: "Import",
  // Долгая операция: прогон ходит по чужому сайту постранично, форма
  // показывает живой счётчик, пока сервер не отчитается об итоге.
  running: "Reading your list…",
  runningProgress: (pages: number, rows: number) =>
    `Pages read: ${pages}, titles found: ${rows}`,
  queued: "Waiting in line — another import is running…",
  doneTitle: "Import finished",
  doneMatched: (n: number) => `Matched and saved: ${n}`,
  doneNotFound: (n: number) => `Not found: ${n}`,
  notFoundIntro:
    "We don't have these titles in the catalog yet — drop us a line and we'll add them:",
  helpLink: "Write to us",
  repeatHint:
    "You can re-run the import any time — it just refreshes the same statuses, no duplicates. Statuses you set here for titles that are not on your MDL list stay untouched.",
  errors: {
    badInput:
      "Enter a nickname (letters, digits, - or _) or a link like https://mydramalist.com/dramalist/nickname",
    rateLimited: "Not so fast — you can run the import once every 10 minutes.",
    alreadyRunning: "Your import is already running.",
    listNotFound: "List not found — check the nickname.",
    listUnavailable: "The list is unavailable — it may be private on MyDramaList.",
    lost: "The import result was lost (server restarted?) — please try again later.",
    generic: "Import failed",
  },
};
