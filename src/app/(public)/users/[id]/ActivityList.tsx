import AppLink from "@/components/AppLink";
import LetterAvatar from "@/components/LetterAvatar";
import { AchievementCoin } from "@/components/AchievementBadge";
import EmptyState from "@/components/EmptyState";
import { formatDateWithYear } from "@/lib/dates";
import { dramaTitleForLocale } from "@/lib/dramaLocale";
import type { ActivityItem } from "@/lib/activityFeed";
import type { ReactNode } from "react";
import type { Dict, Locale } from "@/lib/i18n";
import { formatRating } from "@/components/StarRatingInput";

const TYPE_EMOJI: Record<ActivityItem["type"], string> = {
  watch: "📺",
  favoritePerformer: "❤️",
  going: "🎟️",
  trip: "🧳",
  review: "⭐",
  achievement: "🏆",
};

/**
 * «Последние обновления» — серверный рендер ленты активности
 * (src/lib/activityFeed.ts): строка = иконка типа, название-ссылка,
 * подпись действия, дата. Приватность решена ещё в выборке — сюда
 * приходит уже дозволенный этому зрителю набор.
 */
export default function ActivityList({
  items,
  t,
  locale,
  isSelf,
  ownerName,
}: {
  items: ActivityItem[];
  t: Dict;
  locale: Locale;
  isSelf: boolean;
  ownerName: string;
}) {
  const a = t.social.profile.activity;

  if (items.length === 0) {
    return (
      <EmptyState
        emoji="🌊"
        title={a.emptyTitle}
        hint={isSelf ? a.emptyHintSelf : a.emptyHintViewer(ownerName)}
        cta={isSelf ? { href: "/dramas", label: t.social.profile.dramasTab.emptyCta } : undefined}
        compact
      />
    );
  }

  return (
    <div className="d-flex flex-column gap-2">
      {items.map((item, i) => {
        const title =
          item.type === "watch" || item.type === "review"
            ? dramaTitleForLocale({ title: item.title, titleRu: item.titleRu }, locale)
            : item.title;

        let action: ReactNode;
        switch (item.type) {
          case "watch": {
            const status = t.catalog.watchStatus[item.status];
            // «серия 6 из 10» не разрывается изнутри (правка владельца):
            // перенос разрешён только после « · », хвост цельным куском.
            action =
              item.episodesWatched != null && item.episodesWatched > 0 ? (
                <>
                  {a.watch(status)} ·{" "}
                  <span className="text-nowrap">
                    {a.episodes(item.episodesWatched, item.episodesTotal)}
                  </span>
                </>
              ) : (
                a.watch(status)
              );
            break;
          }
          case "favoritePerformer":
            action = a.favorite;
            break;
          case "going":
            action = a.going;
            break;
          case "trip":
            action = a.trip;
            break;
          case "review":
            action = a.review(formatRating(item.rating));
            break;
          case "achievement":
            action = a.achievement;
            break;
        }

        return (
          <div key={`${item.type}-${i}`} className="activity-row">
            {/* Постер записи вместо эмодзи-иконки (правка владельца):
                строка узнаваема обложкой; у людей — круглая фотка, как
                везде на сайте. Без картинки (поездка, ачивка, запись без
                постера) — прежний эмодзи. */}
            <span className="activity-row-icon" aria-hidden>
              {item.imageUrl ? (
                <LetterAvatar
                  name={item.title}
                  photoUrl={item.imageUrl}
                  size={2.4}
                  rounded={item.type === "favoritePerformer"}
                />
              ) : item.type === "achievement" ? (
                // Тот же чип, что в блоке «Ачивки» (правка владельца) —
                // размер подхватывается от контейнера строки.
                <AchievementCoin emoji={item.emoji} />
              ) : (
                TYPE_EMOJI[item.type]
              )}
            </span>
            <span className="activity-row-body">
              {item.href ? (
                <AppLink href={item.href} className="activity-row-title">
                  {title}
                </AppLink>
              ) : (
                <span className="activity-row-title">{title}</span>
              )}
              <span className="activity-row-action">
                {action}
                {/* Свой приватный отзыв помечаем и в ленте — чтобы не
                    казалось, что его видят все (зрителю приватные не
                    приходят вовсе). */}
                {item.type === "review" && item.isPrivate && (
                  <span className="badge rounded-pill text-bg-secondary ms-2" style={{ fontSize: "0.62rem" }}>
                    {t.reviews.privateBadge}
                  </span>
                )}
              </span>
            </span>
            <span className="activity-row-date">{formatDateWithYear(item.date, locale)}</span>
          </div>
        );
      })}
    </div>
  );
}
