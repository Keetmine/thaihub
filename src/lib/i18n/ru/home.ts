import type { Dict } from "../en";
import { plural, pluralized } from "@/lib/plural";

export const home: Dict["home"] = {
    metaTitle: "Сериалы, артисты и события: фан-трекер",
    eyebrow: "Главная",
    greeting: (name: string) => `Привет, ${name}`,
    upcoming: "Что впереди",
    airingToday: "Выходит сегодня",
    airingTodayCalendar: "Календарь",
    airingAll: "Все",
    airingMine: "Мои",
    airingTodayEpisode: (n: number) => `${n} серия`,
    airingTodayEpisodes: (from: number, to: number) => `${from}–${to} серии`,
    watchingNow: "Смотрю сейчас",
    communities: "В ваших сообществах",
    communityMeetups: "Ближайшие встречи",
    communityPosts: "Свежие обсуждения",
    communityReplies: (n: number) => pluralized(n, ["ответ", "ответа", "ответов"]),
    whatsNew: "Что нового",
    newsLocations: "Места съёмок",
    newsLocationsCount: (n: number) =>
        `${n} ${plural(n, ["место", "места", "мест"])} на карте`,
    newsFromFavourites: "релизы ваших артистов",
    newsFromCatalogue: "свежее в каталоге",
    listen: "Слушать ↗",
    birthdays: "Сегодня день рождения",
    onThisDay: "В этот день",
    onThisDayAgo: (years: number) =>
        years === 1
            ? "вышел год назад"
            : `вышел ${pluralized(years, ["год", "года", "лет"])} назад`,
    friendsFeed: "У друзей",
    turns: (age: number) => `исполняется ${age}`,
    yourFriend: "ваш друг",
    inFavourites: "в избранном",
    shared: "совместная",
    countdownToday: "уже идёт",
    countdownTomorrow: "завтра",
    countdownDays: (days: number) => `через ${pluralized(days, ["день", "дня", "дней"])}`,
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
