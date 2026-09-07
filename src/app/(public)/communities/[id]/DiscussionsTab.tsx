import EmptyState from "@/components/EmptyState";
import { getT } from "@/lib/i18n";

/**
 * Вкладка «Обсуждения» — темы сообщества и комментарии к ним.
 *
 * ЗАГЛУШКА: наполняется отдельной задачей (этап 2, см.
 * docs/features/communities.md). Файл заведён заранее, чтобы каркас
 * страницы собирался и вкладка не появлялась «вдруг».
 */
export default async function DiscussionsTab({
  communityId,
  canPost,
}: {
  communityId: string;
  canPost: boolean;
}) {
  const { t } = await getT();
  void communityId;
  void canPost;
  return (
    <EmptyState emoji="💬" title={t.communities.tabs.discussions} hint={t.communities.soon} compact />
  );
}
