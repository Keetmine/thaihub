import EmptyState from "@/components/EmptyState";
import { getT } from "@/lib/i18n";

/**
 * Вкладка «Поездки» — поездки, собранные этим сообществом.
 *
 * ЗАГЛУШКА: наполняется отдельной задачей, см.
 * docs/features/communities.md.
 */
export default async function TripsTab({
  communityId,
  canCreate,
}: {
  communityId: string;
  canCreate: boolean;
}) {
  const { t } = await getT();
  void communityId;
  void canCreate;
  return <EmptyState emoji="✈️" title={t.communities.tabs.trips} hint={t.communities.soon} compact />;
}
