import { COUNTDOWN_START_DAYS } from "@/lib/tripCountdown";
import type { Dict } from "@/lib/i18n";

/**
 * Тексты уведомлений, правящиеся из админки (`/admin/notifications`,
 * просьба владельца 2026-09-23: «все подписи выведем в админке, чтоб
 * можно было там же и править; вообще все шаблоны уведомлений было б
 * прикольно редактировать»).
 *
 * Устройство — НАКЛАДКОЙ, а не заменой словаря:
 *  - текст по умолчанию по-прежнему лежит в `i18n/*_/notifications.ts`,
 *    приезжает с деплоем и остаётся единственным источником правды для
 *    ненаписанных строк;
 *  - в базе (`NotificationTemplate`) живут ТОЛЬКО переписанные строки,
 *    по одной на ключ и язык. «Сбросить» — это удалить строку, а не
 *    записать копию словарного текста: иначе правка словаря в коде
 *    никогда бы не доехала до тех, кто однажды нажал «сохранить».
 *
 * Подстановка — фигурными скобками: `{who}`, `{subject}`. Значения в
 * шаблон не зашиты, и текст по умолчанию получается ровно так же —
 * словарная функция зовётся с плейсхолдерами вместо имён. Отсюда
 * единственный путь отрисовки: взять текст (правку или словарный) и
 * подставить в него значения. Две ветки «если правка — подставь, иначе
 * позови функцию» разъехались бы при первой же новой переменной.
 */

export const TEMPLATE_GROUPS = [
  { key: "title", title: "Заголовки уведомлений", hint: "Строка в колокольчике и жирная первая строка сообщения в Telegram." },
  { key: "body", title: "Тексты под заголовком", hint: "Вторая строка: подробность повода." },
  { key: "countdown", title: "Обратный отсчёт до поездки", hint: "По подписи на каждый день последнего месяца перед поездкой. Переменных нет — текст целиком." },
] as const;
export type TemplateGroup = (typeof TEMPLATE_GROUPS)[number]["key"];

export type TemplateDef = {
  key: string;
  group: TemplateGroup;
  label: string;
  /** Имена переменных без скобок — их же печатает подсказка в админке. */
  vars: string[];
  /** Словарный текст с плейсхолдерами вместо значений. */
  fallback: (t: Dict) => string;
};

/** Плейсхолдер в тексте: `{who}`. */
const ph = (name: string) => `{${name}}`;

/** Заголовок повода: словарная функция, позванная плейсхолдерами. */
function titleDef(
  kind: string,
  label: string,
  vars: string[],
  render: (titles: Dict["notifications"]["title"], args: string[]) => string,
): TemplateDef {
  return {
    key: `title.${kind}`,
    group: "title",
    label,
    vars,
    fallback: (t) => render(t.notifications.title, vars.map(ph)),
  };
}

const TITLE_DEFS: TemplateDef[] = [
  titleDef("FRIEND_REQUEST", "Заявка в друзья", ["who"], (x, [who]) => x.FRIEND_REQUEST(who)),
  titleDef("FRIEND_ACCEPTED", "Заявку в друзья приняли", ["who"], (x, [who]) => x.FRIEND_ACCEPTED(who)),
  titleDef("COMMENT_REPLY", "Ответ на комментарий", ["who"], (x, [who]) => x.COMMENT_REPLY(who)),
  titleDef("COMMENT_LIKE", "Лайк комментария", ["who"], (x, [who]) => x.COMMENT_LIKE(who)),
  titleDef("TRIP_INVITE", "Приглашение в поездку", ["who", "trip"], (x, [who, trip]) => x.TRIP_INVITE(who, trip)),
  titleDef("TRIP_INVITE_ACCEPTED", "Приглашение в поездку приняли", ["who"], (x, [who]) => x.TRIP_INVITE_ACCEPTED(who)),
  titleDef("TRIP_REMOVED", "Убрали из поездки", ["trip"], (x, [trip]) => x.TRIP_REMOVED(trip)),
  titleDef("TRIP_COUNTDOWN", "Скоро поездка (отсчёт)", ["trip"], (x, [trip]) => x.TRIP_COUNTDOWN(trip)),
  titleDef("FRIEND_GOING", "Друг идёт на событие", ["who", "event"], (x, [who, event]) => x.FRIEND_GOING(who, event)),
  titleDef("FRIEND_ATTENDED", "Друг побывал на событии", ["who", "event"], (x, [who, event]) => x.FRIEND_ATTENDED(who, event)),
  titleDef("ACHIEVEMENT", "Новое достижение", ["name"], (x, [name]) => x.ACHIEVEMENT(name)),
  { key: "title.PREMIUM_GRANTED", group: "title", label: "Подписка активна", vars: [], fallback: (t) => t.notifications.title.PREMIUM_GRANTED },
  { key: "title.PREMIUM_LIFETIME", group: "title", label: "Доступ навсегда", vars: [], fallback: (t) => t.notifications.title.PREMIUM_LIFETIME },
  titleDef("PERFORMER_BIRTHDAY", "День рождения артиста", ["name"], (x, [name]) => x.PERFORMER_BIRTHDAY(name)),
  titleDef("EPISODE_AIRED", "Новая серия", ["drama"], (x, [drama]) => x.EPISODE_AIRED(drama)),
  titleDef("DRAMA_ADDED", "Сериал добавлен в каталог", ["drama"], (x, [drama]) => x.DRAMA_ADDED(drama)),
  titleDef("DRAMA_STARTED", "Стартовал сериал из планов", ["drama"], (x, [drama]) => x.DRAMA_STARTED(drama)),
  titleDef("ONLINE_BOOKING", "Скоро онлайн-бронирование", ["event"], (x, [event]) => x.ONLINE_BOOKING(event)),
  titleDef("PERFORMER_EVENT", "У избранного артиста событие", ["who", "event"], (x, [who, event]) => x.PERFORMER_EVENT(who, event)),
  titleDef("COMMUNITY_DIGEST", "Сводка по сообществу за месяц", ["community"], (x, [c]) => x.COMMUNITY_DIGEST(c)),
  titleDef("COMMUNITY_JOIN_REQUEST", "Заявка в сообщество", ["who", "community"], (x, [who, c]) => x.COMMUNITY_JOIN_REQUEST(who, c)),
  titleDef("COMMUNITY_JOIN_ACCEPTED", "Заявку в сообщество приняли", ["community"], (x, [c]) => x.COMMUNITY_JOIN_ACCEPTED(c)),
  titleDef("COMMUNITY_JOIN_DECLINED", "Заявку в сообщество отклонили", ["community"], (x, [c]) => x.COMMUNITY_JOIN_DECLINED(c)),
  titleDef("COMMUNITY_INVITE", "Приглашение в сообщество", ["who", "community"], (x, [who, c]) => x.COMMUNITY_INVITE(who, c)),
  titleDef("COMMUNITY_POST", "Новая тема в сообществе", ["who", "community"], (x, [who, c]) => x.COMMUNITY_POST(who, c)),
];

const BODY_DEFS: TemplateDef[] = [
  {
    key: "body.birthday",
    group: "body",
    label: "День рождения: возраст",
    vars: ["turns"],
    fallback: (t) => t.notifications.birthdayBody("{turns}" as unknown as number),
  },
  {
    key: "body.episode",
    group: "body",
    label: "Новая серия: номер и всего серий",
    vars: ["n", "total"],
    fallback: (t) => t.notifications.episodeBody("{n}" as unknown as number, "{total}" as unknown as number),
  },
  {
    key: "body.episodeNoTotal",
    group: "body",
    label: "Новая серия: когда общее число серий неизвестно",
    vars: ["n"],
    fallback: (t) => t.notifications.episodeBody("{n}" as unknown as number, null),
  },
  {
    key: "body.onlineBooking",
    group: "body",
    label: "Онлайн-бронирование: время открытия",
    vars: ["time"],
    fallback: (t) => t.notifications.onlineBookingBody("{time}"),
  },
];

/** По подписи на каждый день отсчёта: ключ — сколько дней осталось. */
const COUNTDOWN_DEFS: TemplateDef[] = Array.from(
  { length: COUNTDOWN_START_DAYS + 1 },
  (_, days): TemplateDef => ({
    key: `countdown.${days}`,
    group: "countdown",
    label:
      days === 0 ? "День поездки" : days === 1 ? "За день" : `За ${days} дн.`,
    vars: [],
    fallback: (t) => t.notifications.tripCountdown[days] ?? "",
  }),
);

export const NOTIFICATION_TEMPLATES: TemplateDef[] = [
  ...TITLE_DEFS,
  ...BODY_DEFS,
  ...COUNTDOWN_DEFS,
];

const BY_KEY = new Map(NOTIFICATION_TEMPLATES.map((d) => [d.key, d]));

export function templateDef(key: string): TemplateDef | undefined {
  return BY_KEY.get(key);
}

/** Правки одного языка: ключ → текст. */
export type TemplateOverrides = Record<string, string>;

/** Текст шаблона: правка админки или словарный. */
export function templateText(key: string, t: Dict, overrides?: TemplateOverrides): string {
  const override = overrides?.[key];
  if (override !== undefined && override !== "") return override;
  return BY_KEY.get(key)?.fallback(t) ?? "";
}

/** Подставить значения в `{переменные}`. Неизвестные скобки остаются
 *  текстом: так опечатка в админке видна, а не проглатывается. */
export function fillTemplate(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

export function renderTemplate(
  key: string,
  vars: Record<string, string | number>,
  t: Dict,
  overrides?: TemplateOverrides,
): string {
  return fillTemplate(templateText(key, t, overrides), vars);
}
