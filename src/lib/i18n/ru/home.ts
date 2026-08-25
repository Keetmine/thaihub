import type { Dict } from "../en";

export const home: Dict["home"] = {
    eyebrow: "Главная",
    greeting: (name: string) => `Привет, ${name}`,
    upcoming: "Что впереди",
    watchingNow: "Смотрю сейчас",
    whatsNew: "Что нового",
    newsFromFavourites: "релизы ваших артистов",
    newsFromCatalogue: "свежее в каталоге",
    listen: "Слушать ↗",
    birthdays: "Сегодня день рождения",
    turns: (age: number) => `исполняется ${age}`,
    yourFriend: "ваш друг",
    inFavourites: "в избранном",
    shared: "совместная",
    countdownToday: "уже идёт",
    countdownTomorrow: "завтра",
    countdownDays: (days: number) => `через ${days} дней`,
    countdownMonth: "через месяц",
    countdownMonths: (months: number) => `через ${months} мес.`,
    paywallTitle: "Афиша и отметки «иду» — по подписке",
    paywallHint:
      "Полная афиша с датами и препродажами, календарь и напоминания в Telegram.",
    paywallCta: "Подробнее",
    emptyGoingTitle: "Пока ничего не запланировано",
    emptyGoingHint:
      "Найдите событие в афише и отметьте «Я пойду» — оно появится здесь постером.",
    emptyGoingCta: "Посмотреть афишу",
    emptyNewsTitle: "Пока пусто",
    emptyNewsHint: "Добавьте артистов в избранное — здесь появятся их новые релизы.",
    emptyNewsCta: "К артистам",
};
