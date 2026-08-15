import { prisma } from "@/lib/prisma";
import { computeUserStats, type UserStats } from "@/lib/userStats";
import { sendTelegramMessage } from "@/lib/telegram";

// Ачивки (Д2): условия считаются из UserStats на лету, разблокировка
// фиксируется в UserAchievement (момент получения + поздравление в
// Telegram один раз). Прогресс до следующей показываем по value/target.

export type AchievementDef = {
  key: string;
  emoji: string;
  title: string;
  description: string;
  // value/target — для прогресс-бара; булевы ачивки: 0/1.
  progress: (s: UserStats) => { value: number; target: number };
};

const counter = (get: (s: UserStats) => number, target: number) => (s: UserStats) => ({
  value: Math.min(get(s), target),
  target,
});
const flag = (get: (s: UserStats) => boolean) => (s: UserStats) => ({
  value: get(s) ? 1 : 0,
  target: 1,
});

export const ACHIEVEMENTS: AchievementDef[] = [
  // Концерты
  { key: "first-concert", emoji: "🎤", title: "Первый концерт", description: "Посетить первое событие", progress: counter((s) => s.attendedEvents, 1) },
  { key: "concerts-5", emoji: "🎶", title: "Завсегдатай", description: "Посетить 5 событий", progress: counter((s) => s.attendedEvents, 5) },
  { key: "concerts-10", emoji: "🌟", title: "Суперфан", description: "Посетить 10 событий", progress: counter((s) => s.attendedEvents, 10) },
  { key: "concerts-25", emoji: "👑", title: "Легенда фандома", description: "Посетить 25 событий", progress: counter((s) => s.attendedEvents, 25) },
  { key: "double-day", emoji: "⚡", title: "Дубль", description: "Два события в один день", progress: flag((s) => s.doubleDay) },
  { key: "marathon", emoji: "🏃‍♀️", title: "Марафон", description: "Три события за одну неделю", progress: flag((s) => s.marathonWeek) },
  { key: "early-bird", emoji: "🐦", title: "Ранняя пташка", description: "Отметить «иду» до старта продаж", progress: flag((s) => s.earlyBird) },
  // Площадки и актёры
  { key: "venues-3", emoji: "📍", title: "Знаток площадок", description: "Побывать на 3 разных площадках", progress: counter((s) => s.uniqueVenues, 3) },
  { key: "venues-10", emoji: "🗺", title: "Картограф", description: "Побывать на 10 разных площадках", progress: counter((s) => s.uniqueVenues, 10) },
  { key: "performers-5", emoji: "💘", title: "Вживую!", description: "Увидеть 5 актёров вживую", progress: counter((s) => s.performersSeenLive, 5) },
  { key: "performers-15", emoji: "💖", title: "Коллекционер встреч", description: "Увидеть 15 актёров вживую", progress: counter((s) => s.performersSeenLive, 15) },
  // Паломничество по локациям
  { key: "pilgrim-5", emoji: "⛩", title: "Паломник", description: "Посетить 5 локаций съёмок", progress: counter((s) => s.visitedLocations, 5) },
  { key: "pilgrim-15", emoji: "🏮", title: "Искатель", description: "Посетить 15 локаций съёмок", progress: counter((s) => s.visitedLocations, 15) },
  { key: "pilgrim-30", emoji: "🧭", title: "Хранитель мест", description: "Посетить 30 локаций съёмок", progress: counter((s) => s.visitedLocations, 30) },
  // Дорамы
  { key: "dramas-10", emoji: "📺", title: "Киноман", description: "Досмотреть 10 сериалов", progress: counter((s) => s.completedDramas, 10) },
  { key: "dramas-50", emoji: "🎬", title: "Синефил", description: "Досмотреть 50 сериалов", progress: counter((s) => s.completedDramas, 50) },
  { key: "dramas-100", emoji: "🏆", title: "Энциклопедия BL", description: "Досмотреть 100 сериалов", progress: counter((s) => s.completedDramas, 100) },
  // Поездки
  { key: "first-trip", emoji: "✈️", title: "Первая поездка", description: "Создать первую поездку", progress: counter((s) => s.trips, 1) },
  { key: "trips-3", emoji: "🧳", title: "Частый гость", description: "Три поездки", progress: counter((s) => s.trips, 3) },
  { key: "thai-week", emoji: "🌴", title: "Неделя в Таиланде", description: "Поездка на 7+ дней", progress: flag((s) => s.longestTripDays >= 7) },
  // Соц
  { key: "first-friend", emoji: "🤝", title: "Первый друг", description: "Добавить первого друга", progress: counter((s) => s.friends, 1) },
  { key: "squad", emoji: "👯", title: "Компанией веселее", description: "Событие, куда шли вчетвером+", progress: flag((s) => s.wentWithThreeFriends) },
];

export type AchievementState = AchievementDef & {
  unlocked: boolean;
  unlockedAt: Date | null;
  value: number;
  target: number;
};

/**
 * Состояние всех ачивок юзера + фиксация новых (UserAchievement) с
 * поздравлением в Telegram. Считается при открытии статистики/профиля —
 * отдельного фонового пересчёта нет.
 */
export async function syncAchievements(userId: string, stats?: UserStats): Promise<AchievementState[]> {
  const s = stats ?? (await computeUserStats(userId));
  const unlockedRows = await prisma.userAchievement.findMany({ where: { userId } });
  const unlockedByKey = new Map(unlockedRows.map((r) => [r.key, r.unlockedAt]));

  const result: AchievementState[] = [];
  const newlyUnlocked: AchievementDef[] = [];

  for (const def of ACHIEVEMENTS) {
    const { value, target } = def.progress(s);
    const done = value >= target;
    let unlockedAt = unlockedByKey.get(def.key) ?? null;
    if (done && !unlockedAt) {
      const row = await prisma.userAchievement.create({ data: { userId, key: def.key } });
      unlockedAt = row.unlockedAt;
      newlyUnlocked.push(def);
    }
    result.push({ ...def, unlocked: done || !!unlockedAt, unlockedAt, value, target });
  }

  // Поздравление — fire-and-forget, одна ошибка не мешает остальному.
  if (newlyUnlocked.length > 0 && process.env.TELEGRAM_BOT_TOKEN) {
    void (async () => {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user?.telegramId) return;
      for (const def of newlyUnlocked) {
        await sendTelegramMessage(
          user.telegramId,
          `🏅 Новая ачивка: ${def.emoji} <b>${def.title}</b>\n${def.description}`,
        ).catch(() => {});
      }
    })();
  }

  return result;
}
