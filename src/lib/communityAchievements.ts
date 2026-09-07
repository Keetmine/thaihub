import { prisma } from "@/lib/prisma";
import { type AchievementSeed, type AchievementState, getEnabledAchievements } from "@/lib/achievements";

/**
 * Ачивки СООБЩЕСТВА (АА25, просьба владельца 2026-09-08: «чтобы у
 * сообщества тоже были ачивки — провести одну встречу, 10 участников и
 * т.п.»).
 *
 * Устройство ровно то же, что у личных, и это главное решение здесь:
 * каталог ачивок ОБЩИЙ (модель `Achievement`), а чья ачивка — говорит
 * `scope`. Второго каталога, второй админки и второго сида нет: они
 * разъехались бы с первыми, и разъехались бы молча.
 *
 * Отличий от личных ровно два:
 *
 * 1. метрики считаются ПО СООБЩЕСТВУ, а не по человеку — свой реестр
 *    `COMMUNITY_METRICS` поверх своего свода `CommunityStats`;
 * 2. уведомления о новой ачивке НЕТ. У сообщества нет адресата: слать
 *    всем участникам «сообщество получило медаль» — спам, а слать
 *    одному владельцу нечестно (зарабатывали вместе). Медаль человек
 *    видит там же, где всё остальное, — на странице сообщества.
 */

export type CommunityStats = {
  /** Действующие участники, ВКЛЮЧАЯ владельца: это размер сообщества,
   *  а не «сколько народу привёл хозяин» (у личной ачивки
   *  `communityMembersGathered` владелец как раз не считается — там
   *  вопрос другой). */
  members: number;
  /** Сколько встреч уже ПРОШЛО. Будущая встреча — это ещё намерение:
   *  «провели» она станет, когда дата настанет. */
  meetupsHeld: number;
  /** Самая многолюдная встреча: сколько человек отметили «иду». Тут
   *  считаются и будущие — люди уже собрались, ждать даты незачем. */
  meetupCrowd: number;
  /** Сколько РАЗНЫХ человек хоть раз отметились на встречах сообщества.
   *  Отвечает на «а ходит ли к нам кто-то, кроме тех же троих». */
  meetupGoers: number;
  /** Темы в обсуждениях. */
  posts: number;
  /** Все комментарии во всех темах — «сколько тут вообще разговаривают». */
  comments: number;
  /** Самая живая тема: сколько комментариев в ней одной. */
  liveliestPost: number;
  /** Поездки, собранные из сообщества (`Trip.communityId`). */
  trips: number;
  /** Общие списки мест (`PlaceList.communityId`). */
  placeLists: number;
  /** Сколько дней сообществу — за возраст тоже дают медали. */
  ageDays: number;
};

export type CommunityMetricDef = {
  /** Русская подпись для селекта в админке — как у личных метрик. */
  label: string;
  kind: "counter" | "flag";
  get: (s: CommunityStats) => number;
};

/**
 * Фиксированный набор способов подсчёта — близнец `METRICS` из
 * `achievements.ts`, только про сообщество. Флагов тут нет намеренно:
 * всё, что сообщество делает, счётно, а «первая встреча» — это тот же
 * счётчик с порогом 1, и порог можно подкрутить в админке, не трогая код.
 */
export const COMMUNITY_METRICS = {
  members: { label: "Участников в сообществе", kind: "counter", get: (s) => s.members },
  meetupsHeld: { label: "Проведённых встреч", kind: "counter", get: (s) => s.meetupsHeld },
  meetupCrowd: { label: "Народу на одной встрече", kind: "counter", get: (s) => s.meetupCrowd },
  meetupGoers: { label: "Разных людей на встречах", kind: "counter", get: (s) => s.meetupGoers },
  posts: { label: "Тем в обсуждениях", kind: "counter", get: (s) => s.posts },
  comments: { label: "Комментариев в обсуждениях", kind: "counter", get: (s) => s.comments },
  liveliestPost: { label: "Комментариев в одной теме", kind: "counter", get: (s) => s.liveliestPost },
  trips: { label: "Собранных поездок", kind: "counter", get: (s) => s.trips },
  placeLists: { label: "Общих списков мест", kind: "counter", get: (s) => s.placeLists },
  ageDays: { label: "Возраст сообщества (дней)", kind: "counter", get: (s) => s.ageDays },
} satisfies Record<string, CommunityMetricDef>;

export type CommunityMetricKey = keyof typeof COMMUNITY_METRICS;
export const COMMUNITY_METRIC_KEYS = Object.keys(COMMUNITY_METRICS) as CommunityMetricKey[];

export function isCommunityMetricKey(metric: string): metric is CommunityMetricKey {
  return metric in COMMUNITY_METRICS;
}

/** Значение метрики из свода; неизвестный ключ — ноль, как у личных
 *  (такая ачивка просто никогда не разблокируется, а не роняет страницу). */
export function communityMetricValue(metric: string, s: CommunityStats): number {
  return isCommunityMetricKey(metric) ? COMMUNITY_METRICS[metric].get(s) : 0;
}

/**
 * Стартовый набор ачивок сообщества. Как и личный, попадает в базу
 * ТОЛЬКО прогоном `scripts/seed-achievements.ts` — второго механизма
 * нет.
 *
 * Пороги маленькие по той же причине, что у личных ачивок про
 * сообщества: сайт небольшой, и «100 участников» не получит никто —
 * такая медаль не мотивирует, а расстраивает. Награждается то, после
 * чего в сообществе появляется жизнь: собрались, сходили, поговорили,
 * дожили до следующего месяца.
 */
export const COMMUNITY_ACHIEVEMENT_SEED: AchievementSeed<CommunityMetricKey>[] = [
  // Встречи — то, ради чего сообщества и заводят.
  { key: "com-meetup-1", scope: "COMMUNITY", emoji: "🎉", title: "Первый сбор", hint: "Провести первую встречу", metric: "meetupsHeld", threshold: 1, sort: 10 },
  { key: "com-meetups-3", scope: "COMMUNITY", emoji: "🗓", title: "Собираемся регулярно", hint: "Провести 3 встречи", metric: "meetupsHeld", threshold: 3, sort: 20 },
  { key: "com-meetups-10", scope: "COMMUNITY", emoji: "🏅", title: "Десять встреч", hint: "Провести 10 встреч", metric: "meetupsHeld", threshold: 10, sort: 30 },
  { key: "com-crowd-5", scope: "COMMUNITY", emoji: "🍻", title: "Полный дом", hint: "Собрать пятерых на одну встречу", metric: "meetupCrowd", threshold: 5, sort: 40 },
  { key: "com-goers-10", scope: "COMMUNITY", emoji: "👣", title: "Народ подтянулся", hint: "На встречах побывали 10 разных человек", metric: "meetupGoers", threshold: 10, sort: 50 },
  // Люди.
  { key: "com-members-3", scope: "COMMUNITY", emoji: "🤗", title: "Уже не одни", hint: "Собрать 3 участников", metric: "members", threshold: 3, sort: 60 },
  { key: "com-members-10", scope: "COMMUNITY", emoji: "🏘", title: "Нас десятеро", hint: "Собрать 10 участников", metric: "members", threshold: 10, sort: 70 },
  { key: "com-members-25", scope: "COMMUNITY", emoji: "🏛", title: "Целый клуб", hint: "Собрать 25 участников", metric: "members", threshold: 25, sort: 80 },
  // Обсуждения.
  { key: "com-post-1", scope: "COMMUNITY", emoji: "🗨", title: "Первая тема", hint: "Завести первую тему в обсуждениях", metric: "posts", threshold: 1, sort: 90 },
  { key: "com-posts-10", scope: "COMMUNITY", emoji: "📚", title: "Есть о чём поговорить", hint: "Завести 10 тем в обсуждениях", metric: "posts", threshold: 10, sort: 100 },
  { key: "com-hot-post", scope: "COMMUNITY", emoji: "🔥", title: "Разговорились", hint: "10 комментариев в одной теме", metric: "liveliestPost", threshold: 10, sort: 110 },
  { key: "com-comments-30", scope: "COMMUNITY", emoji: "🗣", title: "Не молчим", hint: "30 комментариев в обсуждениях", metric: "comments", threshold: 30, sort: 120 },
  // Общие дела.
  { key: "com-trip-1", scope: "COMMUNITY", emoji: "🌏", title: "Собрались и поехали", hint: "Собрать поездку из сообщества", metric: "trips", threshold: 1, sort: 130 },
  { key: "com-places-1", scope: "COMMUNITY", emoji: "📌", title: "Наши места", hint: "Завести общий список мест", metric: "placeLists", threshold: 1, sort: 140 },
  // Возраст: сообщества чаще умирают, чем доживают, — дожить тоже
  // достижение.
  { key: "com-month", scope: "COMMUNITY", emoji: "🌱", title: "Месяц вместе", hint: "Сообществу исполнился месяц", metric: "ageDays", threshold: 30, sort: 150 },
  { key: "com-half-year", scope: "COMMUNITY", emoji: "🌳", title: "Полгода вместе", hint: "Сообществу исполнилось полгода", metric: "ageDays", threshold: 180, sort: 160 },
  { key: "com-year", scope: "COMMUNITY", emoji: "🎂", title: "Год вместе", hint: "Сообществу исполнился год", metric: "ageDays", threshold: 365, sort: 170 },
];

/**
 * Свод по сообществу — близнец `computeUserStats`: один `Promise.all`,
 * без N+1 и без запросов в цикле. Считается из того, что уже собрано
 * (встречи, отметки «иду», темы, комментарии, поездки, списки мест) —
 * специального трекинга у ачивок нет и здесь.
 */
export async function computeCommunityStats(communityId: string): Promise<CommunityStats> {
  const now = new Date();

  const [community, members, meetups, goers, posts, trips, placeLists] = await Promise.all([
    prisma.community.findUnique({ where: { id: communityId }, select: { createdAt: true } }),
    prisma.communityMember.count({ where: { communityId, status: "ACTIVE" } }),
    // Встречи сообщества — те же Event со ссылкой сюда. Даты и число
    // отметок берём агрегатами: сами строки отметок тут не нужны, а на
    // живом сообществе их сотни.
    prisma.event.findMany({
      where: { communityId },
      select: {
        occurrences: { select: { startsAt: true } },
        _count: { select: { attendees: true } },
      },
    }),
    // Разные люди на встречах: groupBy по userId — одна строка на
    // человека, сколько бы встреч он ни посетил.
    prisma.eventAttendance.groupBy({
      by: ["userId"],
      where: { event: { communityId } },
    }),
    // Темы: нужны только числа комментариев, поэтому `_count`, а не
    // сами реплики с картинками (та же причина, что у списка тем).
    prisma.communityPost.findMany({
      where: { communityId },
      select: { _count: { select: { comments: true } } },
    }),
    prisma.trip.count({ where: { communityId } }),
    prisma.placeList.count({ where: { communityId } }),
  ]);

  const commentCounts = posts.map((p) => p._count.comments);
  // Возраст в сутках. Удалённое сообщество сюда не приходит (страница
  // до этого места не доживёт), но пустой ответ считаем нулём, а не
  // падаем.
  const ageDays = community
    ? Math.floor((now.getTime() - community.createdAt.getTime()) / 86_400_000)
    : 0;

  return {
    members,
    // «Провели» — встреча с уже прошедшей датой. У встречи дата одна,
    // но условие написано через `some`: правка переносит дату, а не
    // заводит вторую, и лишних строк тут не бывает.
    meetupsHeld: meetups.filter((m) => m.occurrences.some((o) => o.startsAt < now)).length,
    meetupCrowd: meetups.reduce((max, m) => Math.max(max, m._count.attendees), 0),
    meetupGoers: goers.length,
    posts: posts.length,
    comments: commentCounts.reduce((sum, n) => sum + n, 0),
    liveliestPost: commentCounts.reduce((max, n) => Math.max(max, n), 0),
    trips,
    placeLists,
    ageDays,
  };
}

/**
 * Состояние ачивок сообщества + фиксация новых в `CommunityAchievement`.
 * Близнец `syncAchievements`, но БЕЗ уведомлений (см. шапку файла).
 *
 * Зовётся со страницы сообщества и только для тех, кто видит его
 * содержимое: медали висят внутри, а считать их ради гостя незачем.
 * Отдельной фоновой задачи не заводили — пересчёт при открытии
 * страницы стоит один `Promise.all` и показывает новую медаль сразу,
 * ровно как у личных ачивок при заходе в свой профиль.
 */
export async function syncCommunityAchievements(
  communityId: string,
  stats?: CommunityStats,
): Promise<AchievementState[]> {
  const [s, defs, unlockedRows] = await Promise.all([
    stats ? Promise.resolve(stats) : computeCommunityStats(communityId),
    getEnabledAchievements("COMMUNITY"),
    prisma.communityAchievement.findMany({ where: { communityId } }),
  ]);
  const unlockedByKey = new Map(unlockedRows.map((r) => [r.key, r.unlockedAt]));

  const result: AchievementState[] = [];
  for (const def of defs) {
    const target = Math.max(def.threshold, 1);
    const value = Math.min(communityMetricValue(def.metric, s), target);
    const done = value >= target;
    let unlockedAt = unlockedByKey.get(def.key) ?? null;
    if (done && !unlockedAt) {
      // upsert, не create: страницу сообщества могут открыть двое
      // одновременно, и второй наткнулся бы на уже вставленную строку.
      const row = await prisma.communityAchievement.upsert({
        where: { communityId_key: { communityId, key: def.key } },
        create: { communityId, key: def.key },
        update: {},
      });
      unlockedAt = row.unlockedAt;
    }
    result.push({
      key: def.key,
      emoji: def.emoji,
      title: def.title,
      hint: def.hint,
      unlocked: done || !!unlockedAt,
      unlockedAt,
      value,
      target,
    });
  }
  return result;
}
