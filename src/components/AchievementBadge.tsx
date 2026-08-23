import { formatShortDate } from "@/lib/dates";

// Бейдж-«медаль» ачивки (Э2ф) — единый вид для кабинета и публичного
// профиля. Серверный компонент без состояния: крупное эмодзи в круге с
// тёплым свечением, название display-шрифтом, подсказка мелко; у
// полученных — мягкое кольцо-глоу и дата получения. Прогресс-баров нет
// намеренно: неполученные ачивки в кабинете вообще не показываются
// («чтобы было сюрпризом»), поэтому locked-вид почти не используется, но
// поддержан (приглушённая медаль без глоу) на будущее.
// Стили — секция «Э2ф: ачивки» в конце globals.css.

export type AchievementBadgeProps = {
  emoji: string;
  title: string;
  hint?: string;
  unlocked?: boolean;
  unlockedAt?: Date | null;
  /** Компактный вариант для горизонтальных рядов (публичный профиль):
   *  медаль поменьше + название, подсказка уходит в title-атрибут. */
  compact?: boolean;
};

export default function AchievementBadge({
  emoji,
  title,
  hint,
  unlocked = true,
  unlockedAt = null,
  compact = false,
}: AchievementBadgeProps) {
  const stateClass = unlocked ? "achv-medal-unlocked" : "achv-medal-locked";

  if (compact) {
    return (
      <span className={`achv-medal-compact ${stateClass}`} title={hint}>
        <span className="achv-medal-coin" aria-hidden>
          {emoji}
        </span>
        <span className="achv-medal-title">{title}</span>
      </span>
    );
  }

  return (
    <div className={`achv-medal ${stateClass}`} title={hint}>
      <span className="achv-medal-coin" aria-hidden>
        {emoji}
      </span>
      <span className="achv-medal-title font-display">{title}</span>
      {hint && <span className="achv-medal-hint">{hint}</span>}
      {unlocked && unlockedAt && (
        <span className="achv-medal-date">
          {formatShortDate(unlockedAt)} {unlockedAt.getFullYear()}
        </span>
      )}
    </div>
  );
}
