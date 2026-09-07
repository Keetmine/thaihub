import EmptyState from "@/components/EmptyState";
import LocationMapLoader from "@/components/LocationMapLoader";
import { getT } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import PlaceListCard from "./PlaceListCard";
import PlaceListCreateButton from "./PlaceListCreateButton";

/**
 * Вкладка «Места» — общие списки мест сообщества («куда сходить в
 * Минске», АА25).
 *
 * Список сообщества — это обычный `PlaceList` с проставленным
 * `communityId`: своей модели у него нет намеренно. Так он бесплатно
 * получает страницу `/lists/[id]` с картой и пинами, поиск локаций,
 * свои места, заметки, порядок и «посетила» — всё то, что для личных
 * списков уже написано, а вторая копия разъехалась бы с первой (то же
 * решение, что у встреч с моделью `Event`).
 *
 * Вкладка целиком живёт за `access.canSeeInside` (см. page.tsx):
 * содержимое сообщества — участникам. Наружу списки сообщества выходят
 * своей страницей `/lists/[id]` и каталогом локаций, и в обоих случаях
 * по одному правилу (`lists/communityLists.ts`): наружу выходит только
 * публичный список публичного сообщества.
 *
 * Показывает карту по всем местам сразу и карточки списков — те же
 * `PlaceListCard`, что в каталоге локаций и в разделе «Мои места»:
 * плашка-ссылка со счётом мест и видимостью. Сами места живут на
 * странице списка и на карте.
 */
export default async function PlacesTab({
  communityId,
  canEdit,
}: {
  communityId: string;
  canEdit: boolean;
}) {
  const { t } = await getT();
  const s = t.communities.places;

  const lists = await prisma.placeList.findMany({
    where: { communityId },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      visibility: true,
      items: {
        select: {
          location: {
            select: { id: true, name: true, latitude: true, longitude: true },
          },
        },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Общая карта по всем спискам сразу: «куда сходить в Минске» читается
  // с карты быстрее, чем построчно, а по спискам места разложены только
  // для порядка. Одна точка на локацию — одно и то же место может лежать
  // в двух списках.
  const pins = new Map<string, { id: string; name: string; latitude: number; longitude: number }>();
  // Сколько всего мест у сообщества — по РАЗНЫМ локациям: одно место
  // может лежать в двух списках, а человеку интересно, сколько их у
  // сообщества, а не сколько строк в базе.
  const placeIds = new Set<string>();
  for (const list of lists) {
    for (const item of list.items) {
      const l = item.location;
      placeIds.add(l.id);
      if (l.latitude == null || l.longitude == null || pins.has(l.id)) continue;
      pins.set(l.id, { id: l.id, name: l.name, latitude: l.latitude, longitude: l.longitude });
    }
  }

  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
        <div className="d-flex align-items-baseline flex-wrap gap-2">
          <h2 className="section-heading mb-0">{s.heading}</h2>
          {/* Счётчик мест — по РАЗНЫМ локациям: одно место может лежать
              в двух списках. Ноль не показываем — пустой счётчик только
              шумит, как и на соседних вкладках. Подписи самих вкладок
              («Обсуждения (12)») собирает page.tsx, число мест туда
              добавляется одной строкой: см. docs/features/communities.md,
              раздел «Как выглядит вкладка». */}
          {placeIds.size > 0 && (
            <span className="small text-secondary">{t.lists.places.placeCount(placeIds.size)}</span>
          )}
        </div>
        {canEdit && <PlaceListCreateButton communityId={communityId} />}
      </div>
      <p className="small text-secondary mb-0">{s.intro}</p>

      {lists.length === 0 ? (
        <EmptyState
          emoji="📍"
          title={s.emptyTitle}
          hint={canEdit ? s.emptyHint : s.emptyHintReadOnly}
          compact
        />
      ) : (
        <>
          {pins.size > 0 && <LocationMapLoader locations={[...pins.values()]} height="20rem" />}

          <div className="d-flex flex-column gap-2">
            {lists.map((list) => (
              <PlaceListCard key={list.id} list={list} placeCount={list.items.length} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
