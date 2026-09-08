import AchievementBadge from "@/components/AchievementBadge";
import { syncCommunityAchievements } from "@/lib/communityAchievements";
import { getT } from "@/lib/i18n";

/**
 * Медали САМОГО СООБЩЕСТВА в левой колонке страницы (просьба владельца
 * 2026-09-08: ачивки не только у человека, но и у сообщества).
 *
 * Показаны ровно так же, как личные в профиле: иконками-«монетами»
 * общего `AchievementBadge` (вариант `iconOnly`) с кастомным тултипом —
 * название, описание и дата. Второй разметки медали в проекте нет и
 * заводить её незачем: медаль везде выглядит одинаково.
 *
 * Блок рисуется ТОЛЬКО тем, кто видит содержимое сообщества
 * (`communityAccess(...).canSeeInside` — решает страница): достижения
 * зарабатывают внутри, и наружу они не уходят вместе с остальным
 * содержимым.
 *
 * Здесь же и ПЕРЕСЧЁТ (`syncCommunityAchievements`) — по образцу личных
 * ачивок, которые считаются при заходе владельца на свой профиль.
 * Отдельной фоновой задачи не завели: пересчёт стоит один `Promise.all`
 * на и без того динамической странице, а участник видит новую медаль
 * сразу — в суточной задаче он узнал бы о ней через сутки. Гость
 * пересчёта не запускает: блока у него нет.
 */
export default async function AchievementsBlock({
  communityId,
  isMember = false,
}: {
  communityId: string;
  /** Участник видит ещё и прогресс к ближайшей медали. Зритель со
   *  стороны (гость публичного сообщества, админ сайта) — только уже
   *  полученные: прогресс — внутренняя кухня, к которой он ничего не
   *  добавит. */
  isMember?: boolean;
}) {
  const { locale, t } = await getT();
  const s = t.communities.achievements;

  const states = await syncCommunityAchievements(communityId);
  const unlocked = states.filter((a) => a.unlocked);

  // Ближайшая НЕполученная медаль — одна, с максимальной долей
  // готовности (value уже обрезан по target в syncCommunityAchievements,
  // так что остаток всегда ≥ 1). Только одна намеренно: какие медали
  // существуют дальше — сюрприз, и список «до чего ещё далеко» его бы
  // раскрыл. Всё получено — блока прогресса просто нет.
  const next = isMember
    ? states
        .filter((a) => !a.unlocked)
        .reduce<(typeof states)[number] | null>(
          (best, a) => (!best || a.value / a.target > best.value / best.target ? a : best),
          null,
        )
    : null;

  return (
    <div>
      {/* Счётчика «N из N» тут нет (правка владельца 2026-09-09):
          общее число ачивок — это список того, чего у сообщества ещё
          нет, и рядом с полученными медалями он читался как недобор.
          Сколько их всего, мы не показываем вовсе. */}
      <h2 className="section-heading mb-2">{s.title}</h2>
      {unlocked.length === 0 ? (
        // Пустой блок не прячем, в отличие от профиля: про личные ачивки
        // человек уже знает, а про сообщественные — нет, и молчащий
        // уголок ничего бы ему не подсказал. Список медалей при этом
        // остаётся сюрпризом — как и везде.
        <p className="small text-secondary mb-0">{s.emptyHint}</p>
      ) : (
        <div className="d-flex flex-wrap gap-2">
          {unlocked.map((a) => (
            <AchievementBadge
              key={a.key}
              emoji={a.emoji}
              title={a.title}
              hint={a.hint}
              unlockedAt={a.unlockedAt}
              iconOnly
              locale={locale}
            />
          ))}
        </div>
      )}
      {next && (
        <div className="mt-2">
          {/* «До „10 участников“ осталось 3» + тонкая полоса. Полоса —
              та же, что у прогресса по сериям: это просто «сколько из
              скольких», второй вид полосы был бы вторым видом той же
              вещи. */}
          <p className="small text-secondary mb-1">
            {s.nextProgress(next.title, next.target - next.value)}
          </p>
          <span
            className="episode-progress-bar"
            role="progressbar"
            aria-label={next.title}
            aria-valuemin={0}
            aria-valuemax={next.target}
            aria-valuenow={next.value}
          >
            <span style={{ width: `${Math.round((next.value / next.target) * 100)}%` }} />
          </span>
        </div>
      )}
    </div>
  );
}
