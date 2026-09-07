import EmptyState from "@/components/EmptyState";
import { getT } from "@/lib/i18n";

/**
 * Вкладка «Встречи» — события сообщества.
 *
 * ЗАГЛУШКА: наполняется отдельной задачей (этап 3, см.
 * docs/features/communities.md).
 */
export default async function MeetupsTab({
  communityId,
  canCreate,
}: {
  communityId: string;
  canCreate: boolean;
}) {
  const { t } = await getT();
  void communityId;
  void canCreate;
  return <EmptyState emoji="📅" title={t.communities.tabs.meetups} hint={t.communities.soon} compact />;
}
