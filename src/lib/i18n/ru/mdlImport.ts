import type { Dict } from "../en";

/** Импорт списка просмотра с MyDramaList — блок в настройках аккаунта. */
export const mdlImport: Dict["mdlImport"] = {
  tab: "Импорт",
  title: "Импорт из MyDramaList",
  intro:
    "Укажите ник на MyDramaList или ссылку на публичный список — мы перенесём сюда статусы просмотра (Смотрю, Просмотрено, Отложено, В планах, Брошено) и прогресс по сериям.",
  inputLabel: "Ник или ссылка на список",
  inputPlaceholder: "keetmine или https://mydramalist.com/dramalist/keetmine",
  submit: "Импортировать",
  running: "Читаем ваш список…",
  runningProgress: (pages: number, rows: number) =>
    `Прочитано страниц: ${pages}, найдено тайтлов: ${rows}`,
  queued: "Ждём очереди — сейчас идёт другой импорт…",
  doneTitle: "Импорт завершён",
  doneMatched: (n: number) => `Совпало и записано: ${n}`,
  doneNotFound: (n: number) => `Не нашлось: ${n}`,
  notFoundIntro: "Этих сериалов у нас пока нет — напишите нам, и мы их добавим:",
  helpLink: "Написать нам",
  repeatHint:
    "Импорт можно запускать повторно — он просто освежит те же статусы, дублей не будет. Статусы сериалов, которых нет в вашем списке на MDL, не трогаются.",
  errors: {
    badInput:
      "Укажите ник (буквы, цифры, - или _) или ссылку вида https://mydramalist.com/dramalist/ник",
    rateLimited: "Не так быстро — импорт можно запускать раз в 10 минут.",
    alreadyRunning: "Ваш импорт уже идёт.",
    listNotFound: "Список не найден — проверьте ник.",
    listUnavailable: "Список недоступен — возможно, на MyDramaList он приватный.",
    lost: "Итог импорта потерялся (сервер перезапускался?) — попробуйте ещё раз позже.",
    generic: "Импорт не удался",
  },
};
