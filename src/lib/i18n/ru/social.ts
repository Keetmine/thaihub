import { plural } from "@/lib/plural";
import type { Dict } from "../en";

export const social: Dict["social"] = {
  friends: {
    metaTitle: "Друзья",
    metaDescription: "Ваши друзья на MyBLHub.",
    eyebrow: "Профиль",
    title: "Друзья",
    searchPlaceholder: "Найти по имени, нику или email (точно)…",
    searchResults: "Результаты поиска",
    noneFound: "Никого не найдено.",
    noName: "Без имени",
    /** Ответы серверных экшенов заявок. */
    errors: {
      cannotAddSelf: "Нельзя добавить в друзья себя",
      alreadyRequested: "Заявка уже отправлена или вы уже друзья",
    },
    noNameInline: "без имени",

    add: "Добавить в друзья",
    adding: "Отправка…",
    incoming: "Заявки в друзья",
    accept: "Принять",
    decline: "Отклонить",
    declineConfirm: "Отклонить заявку в друзья?",
    outgoing: "Отправленные заявки",
    cancel: "Отменить",
    cancelConfirm: "Отменить заявку в друзья?",

    mine: "Мои друзья",
    emptyTitle: "Пока нет друзей",
    emptyHint:
      "Найдите знакомых по имени или нику в поиске выше — и увидите, на что идут они.",
    remove: "Удалить из друзей",
    removeConfirm: (name: string) => `Удалить «${name}» из друзей?`,
    backToProfile: "← Назад к профилю",
  },

  profile: {
    metaTitle: "Пользователь",
    metaNotFound: "Профиль не найден.",
    metaDescription: (name: string) => `Профиль пользователя ${name} на MyBLHub.`,
    metaDescriptionAnonymous: "Профиль пользователя на MyBLHub.",
    fallbackName: "Пользователь",

    // chip*-счётчики левой колонки удалены — правка владельца: ряда
    // чипов в блоке с фото больше нет.
    memberSince: (date: string) => `На MyBLHub с ${date}`,

    /* Инфо-блок левой колонки в формате подписей (правка владельца,
       образец MDL): Онлайн / Локация / Роль / Дата регистрации.
       Имена ролей — решение 2026-09-04: обычный — «Фанат», с подпиской —
       «Суперфан», админ — «Команда». Менять — только здесь и в en. */
    metaOnline: "Онлайн",
    metaOnlineNow: "сейчас на сайте",
    metaLocation: "Локация",
    metaRole: "Роль",
    roleFan: "Фанат",
    roleSuperfan: "Суперфан",
    roleTeam: "Команда",
    metaBirthday: "Дата рождения",
    metaJoined: "Дата регистрации",

    // Вкладки правой колонки единого профиля (свой и чужой).
    tabs: {
      overview: "Обзор",
      stats: "Статистика",
      reviews: "Отзывы",
      comments: "Комментарии",
      dramas: "Сериалы",
      events: "События",
      trips: "Поездки",
      places: "Места и списки",
      tickets: (n: number) => `Билеты (${n})`,
    },

    // Заголовки левой колонки «Обзора» (лента ужалась вправо, слева —
    // содержательные блоки).
    // Нейтрально, без первого лица: блок виден и на чужом профиле.
    overviewWatching: "Сейчас в просмотре",
    overviewGoing: "Ближайшие события",
    overviewReviews: "Свежие отзывы",

    // «Последние обновления»: лента активности из существующих таблиц
    // (см. src/lib/activityFeed.ts) — иконка, действие, ссылка, дата.
    // Формулировки без глаголов прошедшего времени: пол автора неизвестен.
    activity: {
      title: "Последние обновления",
      emptyTitle: "Обновлений пока нет",
      emptyHintSelf:
        "Отмечайте сериалы, добавляйте любимых артистов, планируйте события — обновления появятся здесь.",
      emptyHintViewer: (name: string) => `У ${name} пока нет видимых обновлений.`,
      watch: (status: string) => `статус просмотра — «${status.toLowerCase()}»`,
      episodes: (n: number, total: number | null) =>
        total ? `серия ${n} из ${total}` : `серия ${n}`,
      favorite: "теперь в любимых артистах",
      going: "отметка «иду» на событие",
      trip: "новая поездка",
      review: (rating: number) => `отзыв — ${rating}/10`,
      achievement: "новая ачивка",
    },

    friendsTitle: "Друзья",
    friendsAll: "Все друзья",
    friendsEmptySelf: "Найдите знакомых на странице друзей.",
    friendsEmpty: "Пока нет друзей.",

    dramasTab: {
      emptyTitle: "В списке пока нет сериалов",
      emptyHintSelf: "Поставьте статус просмотра на странице сериала — список соберётся здесь.",
      emptyHintViewer: (name: string) => `${name} пока не отмечает сериалы.`,
      emptyCta: "Посмотреть сериалы",
      all: "Все сериалы",
    },

    commentsTab: {
      emptyTitle: "Комментариев пока нет",
      emptyHintSelf:
        "Присоединяйтесь к обсуждению на странице сериала, новеллы или события — комментарии соберутся здесь.",
      emptyHintViewer: (name: string) => `${name} пока ничего не комментирует.`,
    },

    tripsTab: {
      emptyTitle: "Поездок пока нет",
      emptyHintSelf: "Спланируйте первую поездку — события, места и дни в одном плане.",
      emptyCtaSelf: "Открыть поездки",
      emptyHintViewer: (name: string) => `У ${name} нет видимых вам поездок.`,
      manage: "Все поездки",
    },

    placesTab: {
      emptyTitle: "Пока пусто",
      emptyHintSelf: "Здесь соберутся списки мест и посещённые локации съёмок.",
      emptyHintViewer: (name: string) => `У ${name} пока нет видимых списков и мест.`,
      emptyCtaSelf: "Мои места",
    },
    yourFriend: "Ваш друг",
    requestSent: "Заявка отправлена",
    answerRequest: "Ответить на заявку",
    addFriend: "В друзья",
    adding: "Отправка…",
    notifyOn: "Уведомления вкл.",
    notifyOff: "Уведомления выкл.",
    notifyOnTitle: "Уведомления об этом друге включены",
    notifyOffTitle: "Уведомления об этом друге выключены",

    hidden: "Этот профиль скрывает свою активность.",
    achievements: "Ачивки",
    going: "Идёт на события",
    goingLocked: "🔒 Списки событий доступны по подписке.",
    goingLockedWithCount: (n: number) =>
      `🔒 Событий: ${n} — списки событий доступны по подписке.`,
    goingEmptyTitle: "Пока никуда не собирается",
    goingEmptyHint: (name: string) => `Когда ${name} отметит «иду», события появятся здесь.`,

    trips: "Поездки",
    visibility: {
      PRIVATE: "Приватная",
      FRIENDS: "Для друзей",
      PUBLIC: "Публичная",
    },

    placeLists: "Списки мест",
    placeCount: (n: number) => `${n} ${plural(n, ["место", "места", "мест"])}`,
    artistLists: "Списки актёров",
    artistCount: (n: number) => `${n} ${plural(n, ["актёр", "актёра", "актёров"])}`,
    visitedPlaces: "Посещённые места",
    favoritePerformers: "Любимые актёры",
  },
};
