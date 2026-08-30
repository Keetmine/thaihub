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
    back: "← Друзья",

    chipFriends: (n: number) => `друзей: ${n}`,
    chipEvents: (n: number) => `событий: ${n}`,
    chipPerformers: (n: number) => `актёров: ${n}`,
    chipDramas: (n: number) => `сериалов: ${n}`,
    memberSince: (date: string) => `На MyBLHub с ${date}`,

    itsYou: "Это вы · в кабинет",
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
