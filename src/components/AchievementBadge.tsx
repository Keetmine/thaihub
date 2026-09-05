import { formatShortDate } from "@/lib/dates";
import type { Locale } from "@/lib/i18n/config";

// Бейдж-«медаль» ачивки (Э2ф) — единый вид для кабинета и публичного
// профиля. Серверный компонент без состояния: крупное эмодзи в круге,
// название display-шрифтом, подсказка мелко; у полученных — тонкое
// кольцо (свечение убрано — правка владельца) и дата. Прогресс-баров нет
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
  /** Только иконка-«монета» (правка владельца: ачивки в профиле —
   *  иконками): название и описание живут в title/aria-label, элемент
   *  фокусируемый — текст доступен и с клавиатуры. */
  iconOnly?: boolean;
  /** Язык — пропом, а не хуком: компонент рендерят и сервер (публичный
   *  профиль), и клиент (кабинет), а useLocale с сервера не зовётся —
   *  профиль падал с «Attempted to call useLocale() from the server». */
  locale: Locale;
};

/** «Монетка» ачивки: сам эмодзи размытым фоном + плёночное зерно +
 *  чёткий эмодзи сверху — тот же приём, что у DetailHero с постером
 *  (правка владельца). Общая для блока ачивок и ленты обновлений:
 *  размер задаёт контейнер через font-size/width. */
export function AchievementCoin({ emoji }: { emoji: string }) {
  return (
    <span className="achv-coin" aria-hidden>
      <span className="achv-coin-bg">{emoji}</span>
      <span className="achv-coin-fg">{emoji}</span>
    </span>
  );
}

export default function AchievementBadge({
  emoji,
  title,
  hint,
  unlocked = true,
  unlockedAt = null,
  compact = false,
  iconOnly = false,
  locale,
}: AchievementBadgeProps) {
  const stateClass = unlocked ? "achv-medal-unlocked" : "achv-medal-locked";

  if (iconOnly) {
    const label = hint ? `${title} — ${hint}` : title;
    return (
      <span
        className={`achv-medal-icon ${stateClass}`}
        aria-label={label}
        role="img"
        tabIndex={0}
      >
        <AchievementCoin emoji={emoji} />
        {/* Кастомный тултип вместо браузерного title (правка владельца:
            тот появляется с секундной задержкой и выглядит чужеродно).
            Разметкой, а не data-tooltip: у ачивки две строки разного
            веса — название и описание. aria-hidden: текст уже целиком
            в aria-label самой медали. */}
        <span className="achv-tip" aria-hidden>
          <span className="achv-tip-title">{title}</span>
          {hint && <span className="achv-tip-hint">{hint}</span>}
          {unlocked && unlockedAt && (
            <span className="achv-tip-date">
              {formatShortDate(unlockedAt, locale)} {unlockedAt.getFullYear()}
            </span>
          )}
        </span>
      </span>
    );
  }

  if (compact) {
    return (
      <span className={`achv-medal-compact ${stateClass}`} title={hint}>
        <AchievementCoin emoji={emoji} />
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
          {formatShortDate(unlockedAt, locale)} {unlockedAt.getFullYear()}
        </span>
      )}
    </div>
  );
}
