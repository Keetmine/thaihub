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
import { communityHref, locationHref, slugOrIdWhere } from "@/lib/slugHelpers";
import { communityRights } from "@/lib/meetups";
import { canSeeCommunityList } from "../communityLists";
import { getT, localeHref } from "@/lib/i18n";
import { userHref, userDisplayName } from "@/lib/userProfile";

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
      user: { select: { id: true, name: true, username: true, deletedAt: true } },
      // Список сообщества («куда сходить в Минске»): и права на него, и
      // видимость считаются по сообществу, а не по человеку.
      community: { select: { id: true, slug: true, title: true, visibility: true } },
      items: {
        include: { location: true },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!list) notFound();

  let canManage: boolean;
  if (list.community) {
    // ---- Список СООБЩЕСТВА ----
    //
    // Править может создатель или модератор — и только они: строка
    // `userId` тут прав не даёт (тот же расчёт, что в
    // `requireListRights` в lists/actions.ts).
    const rights = await communityRights(list.community.id, user?.id);
    canManage = rights.canManage;
    // Кто видит список сообщества — общим правилом (communityLists.ts):
    // тем же, которым каталог мест отбирает списки выборкой. Наружу
    // выходит только публичный список публичного сообщества, у
    // закрытого — ничего; подробности там же.
    if (!canSeeCommunityList(list, list.community, rights.isMember)) notFound();
  } else {
    // ---- Личный список: та же модель видимости, что у поездок ----
    // Чужому 404, не 403.
    canManage = !!user && list.userId === user.id;
    if (!canManage) {
      if (list.visibility === "PRIVATE") notFound();
      if (list.visibility === "FRIENDS") {
        if (!user) redirect(localeHref("/login", locale));
        const ownerFriendIds = await getFriendIds(list.userId);
        if (!ownerFriendIds.includes(user.id)) notFound();
      }
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
      {/* «Назад» ведёт туда, откуда список: в раздел «Мои места» или в
          сообщество, которому он принадлежит. Для чужого списка
          сообщества это ещё и единственный способ понять, куда он
          относится. */}
      {list.community ? (
        <AppLink
          href={`${communityHref(list.community)}?tab=places`}
          className="eyebrow text-decoration-none"
        >
          ← {list.community.title}
        </AppLink>
      ) : (
        <AppLink href="/lists" className="eyebrow text-decoration-none">
          {t.lists.detail.back}
        </AppLink>
      )}
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mt-3 mb-4">
        <div>
          <h1 className="display-1-tight mb-1" style={{ fontSize: "2.5rem" }}>
            {list.title}
          </h1>
          {list.description && <p className="text-secondary mb-0">{list.description}</p>}
        </div>
        {canManage ? (
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <ListVisibilitySelect
              listId={list.id}
              visibility={list.visibility}
              isCommunity={!!list.community}
            />
            <EditListButton list={{ id: list.id, title: list.title, description: list.description }} />
            <ConfirmForm action={boundDelete} confirmMessage={t.lists.detail.deleteConfirm(list.title)}>
              <button type="button" className="btn btn-outline-secondary btn-sm">
                {t.lists.detail.deleteList}
              </button>
            </ConfirmForm>
          </div>
        ) : (
          <div className="d-flex flex-column align-items-end gap-1">
            {/* Чей это список. У списка сообщества — само сообщество со
                ссылкой, а не тот, кто завёл строку: список ведёт
                сообщество, и человек здесь ни при чём. */}
            {list.community ? (
              <AppLink
                href={communityHref(list.community)}
                className="small text-secondary text-decoration-none"
              >
                {t.lists.detail.ofCommunity(list.community.title)}
              </AppLink>
            ) : (
              <AppLink
                href={userHref(list.user)}
                className="small text-secondary text-decoration-none"
              >
                {/* Имя из аккаунта, без «друга»: отношений между
                    людьми мы не знаем (правка владельца 2026-09-06).
                    Удалённый аккаунт подписан отдельно. */}
                {list.user.deletedAt
                  ? t.lists.detail.ofDeleted
                  : t.lists.detail.ofUser(userDisplayName(list.user, locale))}
              </AppLink>
            )}
            {!!user && <ReportButton targetType="placeList" targetId={list.id} />}
          </div>
        )}
      </div>

      {/* Списку сообщества плашка нужна и тому, кто им управляет: по
          заголовку «Куда сходить в Минске» не видно, что это общий
          список, а не личный. */}
      {list.community && canManage && (
        <p className="small text-secondary mb-4">
          <AppLink href={communityHref(list.community)} className="link-body-emphasis">
            {t.lists.detail.ofCommunity(list.community.title)}
          </AppLink>
        </p>
      )}

      {canManage && (
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
          hint={canManage ? t.lists.detail.emptyHintOwn : t.lists.detail.emptyHintGuest}
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
                {/* Само МЕСТО правит только его создатель (canEditPlace):
                    локация принадлежит человеку, даже когда лежит в
                    общем списке сообщества, — модератор может убрать её
                    из списка, но не переименовать чужое место. */}
                {canManage && (
                  <PlaceRowControls
                    listId={list.id}
                    locationId={i.locationId}
                    note={i.note}
                    canEditPlace={!!user && i.location.createdByUserId === user.id}
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
