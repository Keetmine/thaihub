/**
 * Импорт списка просмотра с MyDramaList — блок в настройках аккаунта
 * (вкладка «Import», src/app/(public)/account/settings/).
 */
export const mdlImport = {
  tab: "Import",
  title: "Import from MyDramaList",
  intro:
    "Paste a link to your public MyDramaList list — we will copy your watch statuses (Watching, Watched, On hold, Plan to watch, Dropped) and episode progress over here.",
  inputLabel: "List link",
  inputPlaceholder: "https://mydramalist.com/dramalist/keetmine",
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
  // Без обещаний сроков: заявки видит владелец и импортирует руками.
  notFoundIntro:
    "We don't have these titles in the catalog yet — we saved your list and will add them. Once a title appears, you'll get a notification with a link to it.",
  repeatHint:
    "You can re-run the import any time — it just refreshes the same statuses, no duplicates. Statuses you set here for titles that are not on your MDL list stay untouched.",
  errors: {
    badInput:
      "Paste a link to your list like https://mydramalist.com/dramalist/nickname — copy it from the address bar on MyDramaList",
    rateLimited: "Not so fast — you can run the import once every 10 minutes.",
    alreadyRunning: "Your import is already running.",
    listNotFound: "List not found — check the link.",
    listUnavailable: "The list is unavailable — it may be private on MyDramaList.",
    lost: "The import result was lost (server restarted?) — please try again later.",
    generic: "Import failed",
  },
};
