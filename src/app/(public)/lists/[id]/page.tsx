import AppLink from "@/components/AppLink";
import EmptyState from "@/components/EmptyState";
import ReportButton from "@/components/ReportButton";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { getFriendIds } from "@/lib/friends";
import LocationMapLoader from "@/components/LocationMapLoader";
import ConfirmForm from "@/components/ConfirmForm";
import { deletePlaceList } from "../actions";
import { AddPlaceBox, ListVisibilitySelect, PlaceRowControls } from "./ListControls";
import CreateOwnPlaceButton from "./CreateOwnPlaceButton";
import EditListButton from "./EditListButton";
import VisitedButton from "@/components/VisitedButton";
import { locationHref, slugOrIdWhere } from "@/lib/slugHelpers";
import { getT, localeHref } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function PlaceListPage({ params }: { params: Promise<{ id: string }> }) {
  const { locale, t } = await getT();
  // Гость (без логина) может открыть ПУБЛИЧНЫЙ список по прямой ссылке —
  // proxy.ts пропускает /lists/[id] без куки, а гейт видимости ниже
  // решает по самому списку.
  const user = await getCurrentUser();

  const { id: rawParam } = await params;
  const list = await prisma.placeList.findFirst({
    where: slugOrIdWhere(rawParam),
    include: {
      user: { select: { id: true, name: true } },
      items: {
        include: { location: true },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!list) notFound();

  // Та же модель видимости, что у поездок: чужому 404, не 403.
  const isOwner = !!user && list.userId === user.id;
  if (!isOwner) {
    if (list.visibility === "PRIVATE") notFound();
    if (list.visibility === "FRIENDS") {
      if (!user) redirect(localeHref("/login", locale));
      const ownerFriendIds = await getFriendIds(list.userId);
      if (!ownerFriendIds.includes(user.id)) notFound();
    }
  }

  // Отметки «посетила» текущего зрителя (личное, доступно любому
  // залогиненному зрителю списка).
  const visitedIds = user
    ? new Set(
        (
          await prisma.locationVisit.findMany({
            where: { userId: user.id, locationId: { in: list.items.map((i) => i.locationId) } },
            select: { locationId: true },
          })
        ).map((v) => v.locationId),
      )
    : new Set<string>();

  const pins = list.items
    .filter((i) => i.location.latitude != null && i.location.longitude != null)
    .map((i) => ({
      id: i.location.id,
      name: i.location.name,
      latitude: i.location.latitude!,
      longitude: i.location.longitude!,
    }));

  const boundDelete = deletePlaceList.bind(null, list.id);

  return (
    <div>
      <AppLink href="/lists" className="eyebrow text-decoration-none">
        {t.lists.detail.back}
      </AppLink>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mt-3 mb-4">
        <div>
          <h1 className="display-1-tight mb-1" style={{ fontSize: "2.5rem" }}>
            {list.title}
          </h1>
          {list.description && <p className="text-secondary mb-0">{list.description}</p>}
        </div>
        {isOwner ? (
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <ListVisibilitySelect listId={list.id} visibility={list.visibility} />
            <EditListButton list={{ id: list.id, title: list.title, description: list.description }} />
            <ConfirmForm action={boundDelete} confirmMessage={t.lists.detail.deleteConfirm(list.title)}>
              <button type="button" className="btn btn-outline-secondary btn-sm">
                {t.lists.detail.deleteList}
              </button>
            </ConfirmForm>
          </div>
        ) : (
          <div className="d-flex flex-column align-items-end gap-1">
            <AppLink
              href={`/users/${list.user.id}`}
              className="small text-secondary text-decoration-none"
            >
              {list.user.name ? t.lists.detail.ofUser(list.user.name) : t.lists.detail.ofFriend}
            </AppLink>
            {!!user && <ReportButton targetType="placeList" targetId={list.id} />}
          </div>
        )}
      </div>

      {isOwner && (
        <div className="mb-4 d-flex flex-wrap align-items-center gap-2">
          <AddPlaceBox listId={list.id} />
          <CreateOwnPlaceButton listId={list.id} />
        </div>
      )}

      {pins.length > 0 && (
        <div className="mb-4">
          <LocationMapLoader locations={pins} height="22rem" />
        </div>
      )}

      {list.items.length === 0 ? (
        <EmptyState
          emoji="📍"
          title={t.lists.detail.emptyTitle}
          hint={isOwner ? t.lists.detail.emptyHintOwn : t.lists.detail.emptyHintGuest}
          compact
        />
      ) : (
        <div className="d-flex flex-column gap-2">
          {list.items.map((i) => (
            <div
              key={i.locationId}
              className="surface d-flex align-items-center justify-content-between gap-3 p-3"
            >
              <AppLink
                href={locationHref(i.location)}
                className="text-decoration-none d-flex align-items-center gap-3"
                style={{ minWidth: 0 }}
              >
                {i.location.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    loading="lazy"
                    decoding="async"
                    src={i.location.photoUrl}
                    alt=""
                    style={{ width: "3rem", height: "3rem", borderRadius: "0.6rem", objectFit: "cover", flexShrink: 0 }}
                  />
                ) : (
                  <div
                    style={{ width: "3rem", height: "3rem", borderRadius: "0.6rem", background: "var(--bs-secondary-bg)", flexShrink: 0 }}
                  />
                )}
                <div style={{ minWidth: 0 }}>
                  <p className="font-display fw-medium text-white mb-0 text-truncate">
                    {i.location.name}
                  </p>
                  {i.note && <p className="small text-secondary mb-0 text-truncate">{i.note}</p>}
                </div>
              </AppLink>
              <div className="d-flex align-items-center gap-2 flex-shrink-0">
                {user && (
                  <VisitedButton locationId={i.locationId} isVisited={visitedIds.has(i.locationId)} />
                )}
                {isOwner && (
                  <PlaceRowControls
                    listId={list.id}
                    locationId={i.locationId}
                    note={i.note}
                    canEditPlace={i.location.createdByUserId === user!.id}
                    place={{
                      name: i.location.name,
                      photoUrl: i.location.photoUrl,
                      category: i.location.category,
                    }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
