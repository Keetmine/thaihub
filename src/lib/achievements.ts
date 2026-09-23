import { cache } from "react";
import type { AchievementScope } from "@/generated/prisma/client";
import { userHref } from "@/lib/userProfile";
import { prisma } from "@/lib/prisma";
import { computeUserStats, type UserStats } from "@/lib/userStats";
import { notifyUser } from "@/lib/notifications";

// Ачивки (Д2/Э2ф): определения (эмодзи, название, метрика, порог) живут в
// БД (модель Achievement) и редактируются в /admin/achievements. Само
// вычисление остаётся кодом: `metric` — ключ из фиксированного набора
// METRICS ниже, каждая метрика умеет посчитать себя из UserStats.
// Разблокировка фиксируется в UserAchievement (момент получения +
// поздравление в Telegram один раз). UserAchievement.key ссылается на
// Achievement.key намеренно без FK: удалённая из админки ачивка просто
// перестаёт показываться, строка-факт остаётся.

/**
 * Свод для метрик ачивок: UserStats плюс числа, которые нужны ТОЛЬКО
 * ачивкам и потому не живут в computeUserStats (он питает ещё и вкладку
 * «Статистика», и тащить туда счётчик ради одной медали незачем).
 * `referrals` — сколько людей пришло по реферальной ссылке (аудит
 * 2026-09 п.7), докладывает syncAchievements.
 */
export type AchievementStats = UserStats & { referrals: number };

export type MetricDef = {
  /** Русская подпись для селекта в админке. */
  label: string;
  /**
   * counter — числовая метрика, порог задаётся в админке;
   * flag — бинарное условие («было/не было»), threshold всегда 1.
   */
  kind: "counter" | "flag";
  get: (s: AchievementStats) => number;
};

// Фиксированный набор способов подсчёта. Новая метрика = новая строка тут
// (и, при необходимости, новое поле в computeUserStats) — админка сама
// подхватит её в селект.
export const METRICS = {
  attendedEvents: { label: "Посещённые события", kind: "counter", get: (s) => s.attendedEvents },
  uniqueVenues: { label: "Разные площадки", kind: "counter", get: (s) => s.uniqueVenues },
  performersSeenLive: { label: "Актёры, увиденные вживую", kind: "counter", get: (s) => s.performersSeenLive },
  // Группы и маскоты считаются отдельно от людей (правка владельца
  // 2026-09-23) — и метрики для ачивок тоже свои: концерт группы это не
  // «плюс пять актёров».
  bandsSeenLive: { label: "Группы, увиденные вживую", kind: "counter", get: (s) => s.bandsSeenLive },
  mascotsSeenLive: { label: "Маскоты, увиденные вживую", kind: "counter", get: (s) => s.mascotsSeenLive },
  visitedLocations: { label: "Посещённые локации съёмок", kind: "counter", get: (s) => s.visitedLocations },
  completedDramas: { label: "Досмотренные сериалы", kind: "counter", get: (s) => s.completedDramas },
  // Пересмотры считаются СВЕРХ первого просмотра (DramaWatchStatus.rewatchCount):
  // порог 2 у «одного сериала» — это три просмотра. В подписках ачивок
  // пишем по-человечески («посмотреть три раза»), а порог остаётся сырым
  // числом из базы — иначе он врал бы админке.
  rewatchTotal: { label: "Пересмотры, всего", kind: "counter", get: (s) => s.rewatchTotal },
  topRewatchCount: {
    label: "Пересмотры одного сериала",
    kind: "counter",
    get: (s) => s.mostRewatched?.count ?? 0,
  },
  trips: { label: "Поездки", kind: "counter", get: (s) => s.trips },
  longestTripDays: { label: "Самая длинная поездка (дней)", kind: "counter", get: (s) => s.longestTripDays },
  daysInThailand: { label: "Дни в поездках", kind: "counter", get: (s) => s.daysInThailand },
  friends: { label: "Друзья", kind: "counter", get: (s) => s.friends },
  // Приглашённые по реферальной ссылке (/signup?ref=…): счёт по
  // User.referredById, живые аккаунты (см. syncAchievements).
  referrals: { label: "Приглашённые по ссылке", kind: "counter", get: (s) => s.referrals },
  // Сообщества (АА25). Отдельных флагов тут нет намеренно: «первое
  // сообщество» — это тот же счётчик с порогом 1, и порог у него можно
  // подкрутить в админке, не трогая код.
  communitiesJoined: { label: "Сообщества, куда вступил", kind: "counter", get: (s) => s.communitiesJoined },
  communitiesOwned: { label: "Свои сообщества", kind: "counter", get: (s) => s.communitiesOwned },
  communityPosts: { label: "Темы в обсуждениях", kind: "counter", get: (s) => s.communityPosts },
  communityMembersGathered: { label: "Участников в своём сообществе", kind: "counter", get: (s) => s.communityMembersGathered },
  communityMeetups: { label: "Посещённые встречи сообществ", kind: "counter", get: (s) => s.communityMeetups },
  doubleDay: { label: "Флаг: два события в один день", kind: "flag", get: (s) => (s.doubleDay ? 1 : 0) },
  marathonWeek: { label: "Флаг: три события за неделю", kind: "flag", get: (s) => (s.marathonWeek ? 1 : 0) },
  earlyBird: { label: "Флаг: «иду» до старта продаж", kind: "flag", get: (s) => (s.earlyBird ? 1 : 0) },
  squad: { label: "Флаг: на событие компанией 4+", kind: "flag", get: (s) => (s.wentWithThreeFriends ? 1 : 0) },
} satisfies Record<string, MetricDef>;

export type MetricKey = keyof typeof METRICS;
export const METRIC_KEYS = Object.keys(METRICS) as MetricKey[];

export function isMetricKey(metric: string): metric is MetricKey {
  return metric in METRICS;
}

/** Значение метрики из свода статистики; неизвестный ключ считается нулём
 *  (такая ачивка просто никогда не разблокируется — не падаем). */
export function metricValue(metric: string, s: AchievementStats): number {
  return isMetricKey(metric) ? METRICS[metric].get(s) : 0;
}

// Стартовый набор ачивок — то, что раньше было зашито в код.
// Сидируется в БД скриптом scripts/seed-achievements.ts (идемпотентный
// upsert по key); дальше источник правды — таблица Achievement.
// Новая ачивка добавляется строкой сюда и попадает в базу прогоном
// скрипта — второго механизма нет.
//
// Тип параметризован ключом метрики: у личных ачивок это MetricKey, у
// ачивок сообщества — CommunityMetricKey (см. communityAchievements.ts).
// Так опечатка в метрике ловится компилятором в обоих наборах, а сид
// остаётся один.
export type AchievementSeed<M extends string = string> = {
  key: string;
  /** Чья ачивка. У личных не указывается — в базе это и есть default. */
  scope?: AchievementScope;
  emoji: string;
  title: string;
  hint: string;
  metric: M;
  threshold: number;
  sort: number;
};

export const ACHIEVEMENT_SEED: AchievementSeed<MetricKey>[] = [
  // Концерты
  { key: "first-concert", emoji: "🎤", title: "Первый концерт", hint: "Посетить первое событие", metric: "attendedEvents", threshold: 1, sort: 10 },
  { key: "concerts-5", emoji: "🎶", title: "Завсегдатай", hint: "Посетить 5 событий", metric: "attendedEvents", threshold: 5, sort: 20 },
  { key: "concerts-10", emoji: "🌟", title: "Суперфан", hint: "Посетить 10 событий", metric: "attendedEvents", threshold: 10, sort: 30 },
  { key: "concerts-25", emoji: "👑", title: "Легенда фандома", hint: "Посетить 25 событий", metric: "attendedEvents", threshold: 25, sort: 40 },
  { key: "double-day", emoji: "⚡", title: "Дубль", hint: "Два события в один день", metric: "doubleDay", threshold: 1, sort: 50 },
  { key: "marathon", emoji: "🏃‍♀️", title: "Марафон", hint: "Три события за одну неделю", metric: "marathonWeek", threshold: 1, sort: 60 },
  { key: "early-bird", emoji: "🐦", title: "Ранняя пташка", hint: "Отметить «иду» до старта продаж", metric: "earlyBird", threshold: 1, sort: 70 },
  // Площадки и актёры
  { key: "venues-3", emoji: "📍", title: "Знаток площадок", hint: "Побывать на 3 разных площадках", metric: "uniqueVenues", threshold: 3, sort: 80 },
  { key: "venues-10", emoji: "🗺", title: "Картограф", hint: "Побывать на 10 разных площадках", metric: "uniqueVenues", threshold: 10, sort: 90 },
  { key: "performers-5", emoji: "💘", title: "Вживую!", hint: "Увидеть 5 актёров вживую", metric: "performersSeenLive", threshold: 5, sort: 100 },
  { key: "performers-15", emoji: "💖", title: "Коллекционер встреч", hint: "Увидеть 15 актёров вживую", metric: "performersSeenLive", threshold: 15, sort: 110 },
  // Паломничество по локациям
  { key: "pilgrim-5", emoji: "⛩", title: "Паломник", hint: "Посетить 5 локаций съёмок", metric: "visitedLocations", threshold: 5, sort: 120 },
  { key: "pilgrim-15", emoji: "🏮", title: "Искатель", hint: "Посетить 15 локаций съёмок", metric: "visitedLocations", threshold: 15, sort: 130 },
  { key: "pilgrim-30", emoji: "🧭", title: "Хранитель мест", hint: "Посетить 30 локаций съёмок", metric: "visitedLocations", threshold: 30, sort: 140 },
  // Дорамы
  { key: "dramas-10", emoji: "📺", title: "Киноман", hint: "Досмотреть 10 сериалов", metric: "completedDramas", threshold: 10, sort: 150 },
  { key: "dramas-50", emoji: "🎬", title: "Синефил", hint: "Досмотреть 50 сериалов", metric: "completedDramas", threshold: 50, sort: 160 },
  { key: "dramas-100", emoji: "🏆", title: "Энциклопедия BL", hint: "Досмотреть 100 сериалов", metric: "completedDramas", threshold: 100, sort: 170 },
  // Пересмотры. sort между 170 и 180 — чтобы стоять рядом с сериалами, а
  // не в конце списка; шаг 2 вместо 10, потому что место между блоками
  // уже занято. Пороги — в сырых пересмотрах (сверх первого просмотра):
  // «три раза» — это threshold 2.
  { key: "rewatch-1", emoji: "🔁", title: "Ещё разок", hint: "Пересмотреть сериал", metric: "rewatchTotal", threshold: 1, sort: 172 },
  { key: "rewatch-same-3", emoji: "📼", title: "Знаю наизусть", hint: "Посмотреть один сериал три раза", metric: "topRewatchCount", threshold: 2, sort: 174 },
  { key: "rewatch-same-5", emoji: "💿", title: "Пятый заход", hint: "Посмотреть один сериал пять раз", metric: "topRewatchCount", threshold: 4, sort: 176 },
  { key: "rewatch-10", emoji: "🌀", title: "По второму кругу", hint: "Набрать 10 пересмотров", metric: "rewatchTotal", threshold: 10, sort: 178 },
  // Поездки
  { key: "first-trip", emoji: "✈️", title: "Первая поездка", hint: "Создать первую поездку", metric: "trips", threshold: 1, sort: 180 },
  { key: "trips-3", emoji: "🧳", title: "Частый гость", hint: "Три поездки", metric: "trips", threshold: 3, sort: 190 },
  { key: "thai-week", emoji: "🌴", title: "Неделя в поездке", hint: "Поездка на 7+ дней", metric: "longestTripDays", threshold: 7, sort: 200 },
  // Соц
  { key: "first-friend", emoji: "🤝", title: "Первый друг", hint: "Добавить первого друга", metric: "friends", threshold: 1, sort: 210 },
  // Рефералка (аудит 2026-09 п.7). sort между «другом» и «компанией» —
  // шаг 4, место между блоками уже занято (как у пересмотров выше).
  // Приглашённому отдельная медаль не нужна: авто-дружба с тем, кто
  // позвал, разблокирует обычного «Первого друга».
  { key: "referral-1", emoji: "💌", title: "Свой человек", hint: "Кто-то зарегистрировался по вашей ссылке", metric: "referrals", threshold: 1, sort: 214 },
  { key: "squad", emoji: "👯", title: "Компанией веселее", hint: "Событие, куда шли вчетвером+", metric: "squad", threshold: 1, sort: 220 },
  // Сообщества (АА25). Пороги нарочно маленькие: сайт небольшой, и
  // ачивка «100 участников» не будет получена никогда — она не мотивирует,
  // а расстраивает. Всё, что тут награждается, — первые шаги, после
  // которых в сообществе появляется жизнь: пришёл, завёл, написал,
  // собрал людей, сходил.
  { key: "community-join-1", emoji: "🫂", title: "Нашлись свои", hint: "Вступить в первое сообщество", metric: "communitiesJoined", threshold: 1, sort: 230 },
  { key: "community-own-1", emoji: "🏡", title: "Свой дом", hint: "Создать своё сообщество", metric: "communitiesOwned", threshold: 1, sort: 240 },
  { key: "community-post-1", emoji: "💬", title: "Слово за слово", hint: "Завести первую тему в обсуждениях", metric: "communityPosts", threshold: 1, sort: 250 },
  { key: "community-posts-5", emoji: "📣", title: "Заводила", hint: "Завести 5 тем в обсуждениях", metric: "communityPosts", threshold: 5, sort: 260 },
  { key: "community-members-3", emoji: "👥", title: "Компания собралась", hint: "Собрать 3 участников в своём сообществе", metric: "communityMembersGathered", threshold: 3, sort: 270 },
  { key: "community-members-10", emoji: "🎪", title: "Клуб по интересам", hint: "Собрать 10 участников в своём сообществе", metric: "communityMembersGathered", threshold: 10, sort: 280 },
  { key: "community-meetup-1", emoji: "🍿", title: "Первая встреча", hint: "Сходить на встречу сообщества", metric: "communityMeetups", threshold: 1, sort: 290 },
  { key: "community-meetups-3", emoji: "🥳", title: "Свои люди", hint: "Сходить на 3 встречи сообществ", metric: "communityMeetups", threshold: 3, sort: 300 },
];

export type AchievementState = {
  key: string;
  emoji: string;
  title: string;
  hint: string;
  unlocked: boolean;
  unlockedAt: Date | null;
  value: number;
  target: number;
};

/**
 * Включённые определения в порядке показа (sort, затем дата создания).
 *
 * Каталог общий для личных ачивок и ачивок сообщества, поэтому выборка
 * ВСЕГДА фильтруется по `scope`: без фильтра медали сообщества
 * попадали бы в личный прогресс «N из M» и в ленту обновлений человека,
 * а метрики у них считаются от другого свода.
 *
 * React.cache: на своём профиле каталог спрашивают трое (пересчёт,
 * бейджи в левой колонке и лента обновлений) — один запрос на HTTP-запрос
 * вместо трёх. Кэш живёт ровно один запрос, поэтому правка в админке
 * видна сразу.
 */
export const getEnabledAchievements = cache((scope: AchievementScope = "USER") => {
  return prisma.achievement.findMany({
    where: { enabled: true, scope },
    orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
  });
});

// Троттлинг пересчёта: последний прогон на пользователя, в памяти
// процесса (как лимитер входа в lib/rateLimit.ts — процесс один,
// single-container deploy). Своя страница профиля открывается по
// несколько раз подряд, а пересчёт — это чтения плюс возможные записи;
// пока идёт окно, хватает уже зафиксированных медалей.
const lastSync = new Map<string, number>();
// 10 минут: ачивка не теряется, а лишь появляется на профиле не в ту же
// секунду, что действие, её открывшее. Уведомление придёт тогда же —
// на следующем открытии профиля после окна.
const SYNC_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Пора ли пересчитывать ачивки этому человеку. Спрашивать ДО того, как
 * готовить данные для `syncAchievements`: смысл окна в том, чтобы
 * лишние чтения вообще не уезжали в базу.
 */
export function achievementsSyncDue(userId: string, now = Date.now()): boolean {
  for (const [key, at] of lastSync) {
    if (at + SYNC_INTERVAL_MS <= now) lastSync.delete(key);
  }
  const at = lastSync.get(userId);
  return at == null || at + SYNC_INTERVAL_MS <= now;
}

/** Строка уже выданной медали — столько о ней знают и пересчёт, и
 *  бейджи левой колонки, и лента. */
export type UnlockedRow = { key: string; unlockedAt: Date };

/**
 * Состояние всех ВКЛЮЧЁННЫХ ачивок юзера + фиксация новых (UserAchievement)
 * с поздравлением в Telegram. Считается при открытии своего профиля —
 * отдельного фонового пересчёта нет, но не чаще раза в SYNC_INTERVAL_MS
 * (см. `achievementsSyncDue`). Выключенные (enabled=false) не считаются и
 * не возвращаются вовсе.
 *
 * `stats` принимается и ОБЕЩАНИЕМ свода: тогда собственные чтения
 * пересчёта (рефералы, каталог, выданные медали) идут параллельно с ним,
 * а не после — на профиле это была отдельная последовательная ступень.
 * `preloaded` — те же строки, если вызывающий их уже выбрал.
 */
export async function syncAchievements(
  userId: string,
  stats?: UserStats | Promise<UserStats>,
  preloaded?: { referrals?: number; unlockedRows?: UnlockedRow[] },
): Promise<AchievementState[]> {
  const [base, referrals, defs, unlockedRows] = await Promise.all([
    stats ?? computeUserStats(userId),
    // Приглашённые по реферальной ссылке — прямо здесь, а не в
    // computeUserStats: тот свод питает ещё и вкладку «Статистика», а
    // это число нужно только ачивкам. Удалённые аккаунты не в счёт:
    // «привела человека» — про живого человека на сайте, при этом уже
    // выданная медаль (строка UserAchievement) никуда не денется.
    preloaded?.referrals ??
      prisma.user.count({ where: { referredById: userId, deletedAt: null } }),
    getEnabledAchievements(),
    preloaded?.unlockedRows ?? prisma.userAchievement.findMany({ where: { userId } }),
  ]);
  lastSync.set(userId, Date.now());
  const s: AchievementStats = { ...base, referrals };
  const unlockedByKey = new Map(unlockedRows.map((r) => [r.key, r.unlockedAt]));

  const result: AchievementState[] = [];
  const newlyUnlocked: { key: string; emoji: string; title: string; hint: string }[] = [];

  for (const def of defs) {
    const target = Math.max(def.threshold, 1);
    const value = Math.min(metricValue(def.metric, s), target);
    const done = value >= target;
    const unlockedAt = unlockedByKey.get(def.key) ?? null;
    if (done && !unlockedAt) newlyUnlocked.push(def);
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

  // Записи — одной волной, а не по очереди внутри цикла: обычно медаль
  // одна, но у человека, пришедшего с готовой историей, их сразу
  // десяток, и это были десять последовательных запросов.
  // upsert, не create: параллельный запрос (два открытых профиля) мог
  // успеть зафиксировать ту же ачивку.
  if (newlyUnlocked.length > 0) {
    const rows = await Promise.all(
      newlyUnlocked.map((def) =>
        prisma.userAchievement.upsert({
          where: { userId_key: { userId, key: def.key } },
          create: { userId, key: def.key },
          update: {},
        }),
      ),
    );
    const unlockedNow = new Map(rows.map((r) => [r.key, r.unlockedAt]));
    for (const item of result) {
      const at = unlockedNow.get(item.key);
      if (at) item.unlockedAt = at;
    }
  }

  // Поздравление — fire-and-forget, одна ошибка не мешает остальному.
  // Через notifyUser: строка в колокольчике достаётся всем, а Telegram
  // только тем, у кого он привязан.
  if (newlyUnlocked.length > 0) {
    void (async () => {
      // Ник для ссылки: страница принимает и id, но человек открывает
      // уведомление и видит адрес — пусть это будет /users/username, а
      // не строка из букв и цифр (жалоба владельца 2026-09-06). Один
      // короткий запрос на разблокировку ачивки — событие редкое.
      const owner = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true },
      });
      for (const def of newlyUnlocked) {
        await notifyUser({
          userId,
          kind: "ACHIEVEMENT",
          // Название ачивки — содержимое базы, его не переводим.
          subject: `${def.emoji} ${def.title}`,
          body: def.hint,
          // Прямо на профиль владельца (кабинет /account остался лишь
          // редиректом).
          href: owner ? userHref(owner) : `/users/${userId}`,
        });
      }
    })();
  }

  return result;
}

/**
 * Только уже зафиксированные (и всё ещё включённые) ачивки — для чужих
 * страниц вроде публичного профиля, а также для своего между
 * пересчётами (см. `achievementsSyncDue`).
 *
 * `preloaded` — те же строки UserAchievement, если вызывающий их уже
 * выбрал; порядок «сначала старые» тогда наводится здесь.
 */
export async function getUnlockedAchievements(userId: string, preloaded?: UnlockedRow[]) {
  const [defs, rows] = await Promise.all([
    getEnabledAchievements(),
    preloaded
      ? [...preloaded].sort((a, b) => a.unlockedAt.getTime() - b.unlockedAt.getTime())
      : prisma.userAchievement.findMany({ where: { userId }, orderBy: { unlockedAt: "asc" } }),
  ]);
  const byKey = new Map(defs.map((d) => [d.key, d]));
  return rows.flatMap((r) => {
    const def = byKey.get(r.key);
    // Удалённая/выключенная в админке ачивка — строка остаётся, но бейдж
    // не показываем.
    if (!def) return [];
    return [{ key: def.key, emoji: def.emoji, title: def.title, hint: def.hint, unlockedAt: r.unlockedAt }];
  });
}
