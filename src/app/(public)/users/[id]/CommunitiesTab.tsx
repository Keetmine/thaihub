import AppLink from "@/components/AppLink";
import EmptyState from "@/components/EmptyState";
import UploadImage from "@/components/UploadImage";
import { communityHref } from "@/lib/slugHelpers";
import type { Dict } from "@/lib/i18n";

export type ProfileCommunityRow = {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  coverUrl: string | null;
  /** PRIVATE сюда попадает ТОЛЬКО в своём профиле — страница отсекает
   *  такие сообщества в самом запросе (см. users/[id]/page.tsx). Здесь
   *  флаг нужен лишь для подписи «видно только вам». */
  isPrivate: boolean;
  members: number;
};

/**
 * Вкладка «Сообщества» в профиле: где человек состоит.
 *
 * Строка сообщества — обложка + название + счётчик, как карточка на
 * витрине /communities, только с картинкой: в профиле это единственное,
 * что отличает одно сообщество от другого с одного взгляда.
 *
 * Приватность решается НЕ здесь, а в выборке страницы: закрытые
 * сообщества в чужой профиль не попадают даже в пропсы. Компонент
 * рисует ровно то, что ему дали.
 */
export default function CommunitiesTab({
  communities,
  isSelf,
  ownerName,
  t,
}: {
  communities: ProfileCommunityRow[];
  isSelf: boolean;
  ownerName: string;
  t: Dict;
}) {
  const p = t.social.profile;
  const c = p.communitiesTab;

  if (communities.length === 0) {
    return (
      <EmptyState
        emoji="🫂"
        title={c.emptyTitle}
        hint={isSelf ? c.emptyHintSelf : c.emptyHintViewer(ownerName)}
        cta={isSelf ? { href: "/communities", label: c.emptyCtaSelf } : undefined}
        compact
      />
    );
  }

  return (
    <div className="d-flex flex-column gap-2">
      {communities.map((community) => (
        <AppLink
          key={community.id}
          href={communityHref(community)}
          className="surface surface-hover text-decoration-none d-flex align-items-center gap-3 p-2"
        >
          {/* Тот же блок обложки, что в колонке сообщества
              (.community-cover): без картинки он остаётся тёплой
              заливкой, а не пустым серым прямоугольником. */}
          <div className="community-cover flex-shrink-0" style={{ width: "5.25rem" }}>
            {community.coverUrl && (
              <UploadImage src={community.coverUrl} alt="" sizes="5.25rem" />
            )}
          </div>
          <div style={{ minWidth: 0 }} className="flex-grow-1">
            <p className="font-display fw-medium text-white mb-0 text-truncate">
              {community.title}
            </p>
            {community.description && (
              <p className="small text-secondary mb-0 text-truncate">{community.description}</p>
            )}
            <p className="small text-secondary mb-0">
              {t.communities.membersCount(community.members)}
              {community.isPrivate && ` · ${t.communities.visibility.PRIVATE}`}
            </p>
          </div>
        </AppLink>
      ))}
      {/* Закрытые сообщества показываются только своему; зрителю их в
          этом списке нет вовсе, поэтому и оговорка ему не нужна. */}
      {isSelf && communities.some((x) => x.isPrivate) && (
        <p className="small text-secondary mb-0">{c.privateNote}</p>
      )}
    </div>
  );
}
