import AppLink from "@/components/AppLink";
import EmptyState from "@/components/EmptyState";
import LocationMapLoader from "@/components/LocationMapLoader";
import { getT } from "@/lib/i18n";
import { categoryEmoji } from "@/lib/locationCategories";
import { prisma } from "@/lib/prisma";
import { listHref, locationHref } from "@/lib/slugHelpers";
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
 * содержимое сообщества — участникам. Наружу список сообщества выходит
 * только своей страницей `/lists/[id]` и только в одном случае — он
 * публичный И сообщество публичное; гейт там же, на странице.
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

  // Сколько мест показывать в карточке списка: превью, а не сам список —
  // за полным содержимым человек уходит на страницу списка, где карта и
  // заметки.
  const PREVIEW = 5;

  const lists = await prisma.placeList.findMany({
    where: { communityId },
    include: {
      items: {
        include: {
          location: {
            select: {
              id: true,
              slug: true,
              name: true,
              photoUrl: true,
              category: true,
              latitude: true,
              longitude: true,
            },
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
  for (const list of lists) {
    for (const item of list.items) {
      const l = item.location;
      if (l.latitude == null || l.longitude == null || pins.has(l.id)) continue;
      pins.set(l.id, { id: l.id, name: l.name, latitude: l.latitude, longitude: l.longitude });
    }
  }

  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
        <h2 className="section-heading mb-0">{s.heading}</h2>
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

          {lists.map((list) => {
            const shown = list.items.slice(0, PREVIEW);
            const rest = list.items.length - shown.length;
            return (
              <div key={list.id} className="surface p-3 d-flex flex-column gap-2">
                <div className="d-flex flex-wrap align-items-start justify-content-between gap-2">
                  <h3 className="h6 font-display mb-0">
                    <AppLink href={listHref(list)} className="text-reset text-decoration-none">
                      {list.title}
                    </AppLink>
                  </h3>
                  <span className="small text-secondary">
                    {/* Видимость видна всем участникам, а не только тем,
                        кто её меняет: по открытому списку люди должны
                        понимать, что он ушёл наружу. */}
                    {list.visibility === "PUBLIC" ? s.openToEveryone : s.membersOnly}
                    {" · "}
                    {t.lists.places.placeCount(list.items.length)}
                  </span>
                </div>

                {list.description && (
                  <p className="small text-secondary mb-0">{list.description}</p>
                )}

                {list.items.length === 0 ? (
                  <p className="small text-secondary mb-0">{s.listEmpty}</p>
                ) : (
                  <div className="d-flex flex-column gap-1">
                    {shown.map((item) => (
                      <AppLink
                        key={item.locationId}
                        href={locationHref(item.location)}
                        className="text-decoration-none d-flex align-items-center gap-2"
                        style={{ minWidth: 0 }}
                      >
                        {item.location.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            loading="lazy"
                            decoding="async"
                            src={item.location.photoUrl}
                            alt=""
                            style={{
                              width: "2rem",
                              height: "2rem",
                              borderRadius: "0.5rem",
                              objectFit: "cover",
                              flexShrink: 0,
                            }}
                          />
                        ) : (
                          <span
                            className="d-flex align-items-center justify-content-center"
                            style={{
                              width: "2rem",
                              height: "2rem",
                              borderRadius: "0.5rem",
                              background: "var(--bs-secondary-bg)",
                              flexShrink: 0,
                            }}
                            aria-hidden
                          >
                            {categoryEmoji(item.location.category) ?? "📍"}
                          </span>
                        )}
                        <span className="small text-white text-truncate">
                          {item.location.name}
                        </span>
                        {item.note && (
                          <span className="small text-secondary text-truncate">— {item.note}</span>
                        )}
                      </AppLink>
                    ))}
                  </div>
                )}

                <p className="small mb-0">
                  <AppLink href={listHref(list)} className="link-body-emphasis">
                    {rest > 0 ? s.morePlaces(rest) : `${s.openList} →`}
                  </AppLink>
                </p>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
