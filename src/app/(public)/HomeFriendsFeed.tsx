import AppLink from "@/components/AppLink";
import LetterAvatar from "@/components/LetterAvatar";
import { getFriendsActivity } from "@/lib/activityFeed";
import { formatDateWithYear } from "@/lib/dates";
import { dramaTitleForLocale } from "@/lib/dramaLocale";
import { getT } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { userDisplayName, userHref } from "@/lib/userProfile";
import { activityAction } from "./users/[id]/ActivityList";

/**
 * Мини-блок «У друзей» на главной: три последние записи из лент
 * активности друзей. Это СОЗНАТЕЛЬНО минимальная версия отложенной
 * «ленты новостей» (Г3, согласовано владельцем): без пагинации, без
 * фильтров, без своей страницы — только «друзья живут, вот последнее».
 * Разрастаться блоку нельзя — полная лента, если её решат делать,
 * будет отдельной задачей.
 *
 * Выборка — общая деривация src/lib/activityFeed.ts (та же, что кормит
 * профиль), только по списку друзей разом: своей логики источников у
 * блока нет. Приватность решена там же, в выборке: чужие приватные
 * отзывы не приезжают, «иду» — только зрителю с подпиской.
 *
 * Гость и человек без друзей блока не видят: гейт (friendIds) считает
 * page.tsx из уже сделанного запроса — без друзей компонент даже не
 * рендерится, и запросов от него ноль.
 */
export default async function HomeFriendsFeed({
  friendIds,
  viewerPremium,
}: {
  friendIds: string[];
  viewerPremium: boolean;
}) {
  const items = await getFriendsActivity(friendIds, viewerPremium, 3);
  if (items.length === 0) return null;

  const { t, locale } = await getT();
  // Имена и фото авторов — отдельным запросом по горстке id из трёх
  // строк: тащить профиль владельца в каждую выборку ленты дороже.
  const users = await prisma.user.findMany({
    // Мягко удалённый друг из блока пропадает вместе со строками —
    // подписывать «Удалённый аккаунт» на главной незачем.
    where: {
      id: { in: [...new Set(items.map((i) => i.userId))] },
      deletedAt: null,
    },
    select: { id: true, name: true, username: true, photoUrl: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  return (
    // Отступ задаёт бенто-сетка (gap), свой mt-4 внутри плитки
    // сдвигал бы заголовок вниз относительно соседей.
    <section>
      <h2 className="section-heading mb-3">{t.home.friendsFeed}</h2>
      <div className="d-flex flex-column gap-2">
        {items.map((item, i) => {
          const friend = byId.get(item.userId);
          if (!friend) return null; // друг успел удалиться — строку молча пропускаем
          const title =
            item.type === "watch" || item.type === "review"
              ? dramaTitleForLocale(
                  { title: item.title, titleRu: item.titleRu },
                  locale,
                )
              : item.title;
          return (
            <div key={`${item.type}-${i}`} className="activity-row">
              {/* В иконке строки — ДРУГ, а не обложка записи: блок
                  отвечает на «что у моих», и лицо тут главнее постера. */}
              <span className="activity-row-icon" aria-hidden>
                <LetterAvatar
                  name={friend.name}
                  photoUrl={friend.photoUrl}
                  size={2.4}
                />
              </span>
              <span className="activity-row-body">
                <AppLink href={userHref(friend)} className="activity-row-title">
                  {userDisplayName(friend, locale)}
                </AppLink>
                <span className="activity-row-action">
                  {activityAction(item, t)}
                  {" · "}
                  {item.href ? (
                    <AppLink href={item.href} className="text-secondary">
                      {title}
                    </AppLink>
                  ) : (
                    title
                  )}
                </span>
              </span>
              <span className="activity-row-date">
                {formatDateWithYear(item.date, locale)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
