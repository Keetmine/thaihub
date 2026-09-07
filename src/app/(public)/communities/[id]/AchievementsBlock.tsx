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
export default async function AchievementsBlock({ communityId }: { communityId: string }) {
  const { locale, t } = await getT();
  const s = t.communities.achievements;

  const states = await syncCommunityAchievements(communityId);
  const unlocked = states.filter((a) => a.unlocked);

  return (
    <div>
      <h2 className="section-heading mb-2">
        {s.title}
        {unlocked.length > 0 && (
          <span className="text-secondary text-lowercase ms-2" style={{ letterSpacing: 0 }}>
            {s.progress(unlocked.length, states.length)}
          </span>
        )}
      </h2>
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
    </div>
  );
}
