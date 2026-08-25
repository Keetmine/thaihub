import AppLink from "@/components/AppLink";
import EmptyState from "@/components/EmptyState";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { getFriendIds } from "@/lib/friends";
import ConfirmForm from "@/components/ConfirmForm";
import EntityMiniCard from "@/components/EntityMiniCard";
import BackLink from "@/components/BackLink";
import { slugOrIdWhere } from "@/lib/slugHelpers";
import { performerHref } from "@/lib/performerSlug";
import AddPerformerBox from "../AddPerformerBox";
import ArtistListControls from "./ArtistListControls";
import { removePerformerFromList, deletePerformerList } from "../actions";
import { pageMetadata } from "@/lib/seo";
import { getT, localeHref } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const { t } = await getT();
  const list = await prisma.performerList.findFirst({
    where: slugOrIdWhere(rawId),
    select: { title: true, description: true },
  });
  if (!list)
    return pageMetadata({
      title: t.lists.artists.metaTitle,
      description: t.lists.artists.metaNotFound,
      noIndex: true,
    });
  return pageMetadata({
    title: list.title,
    description:
      list.description?.slice(0, 160) ?? t.lists.artists.metaDescription(list.title),
    path: `/artist-lists/${rawId}`,
    noIndex: true,
  });
}

export default async function ArtistListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const { locale, t } = await getT();
  const user = await getCurrentUser();

  const list = await prisma.performerList.findFirst({
    where: slugOrIdWhere(rawId),
    include: {
      user: { select: { id: true, name: true } },
      items: {
        include: { performer: true },
        orderBy: { position: "asc" },
      },
    },
  });
  if (!list) notFound();

  // Та же модель видимости, что у списков мест: чужому 404, не 403.
  const isOwner = !!user && list.userId === user.id;
  if (!isOwner) {
    if (list.visibility === "PRIVATE") notFound();
    if (list.visibility === "FRIENDS") {
      if (!user) redirect(localeHref("/login", locale));
      const ownerFriendIds = await getFriendIds(list.userId);
      if (!ownerFriendIds.includes(user.id)) notFound();
    }
  }

  return (
    <div>
      <BackLink fallbackHref="/lists" fallbackLabel={t.lists.artists.back} />

      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-3 mb-4">
        <div>
          <h1 className="display-1-tight mb-1" style={{ fontSize: "2.5rem" }}>
            {list.title}
          </h1>
          {list.description && <p className="text-secondary mb-0">{list.description}</p>}
        </div>
        {isOwner ? (
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <ArtistListControls
              list={{
                id: list.id,
                title: list.title,
                description: list.description,
                visibility: list.visibility,
              }}
            />
            <ConfirmForm
              action={deletePerformerList.bind(null, list.id)}
              confirmMessage={t.lists.artists.deleteConfirm(list.title)}
            >
              <button type="button" className="btn btn-outline-secondary btn-sm">
                {t.lists.artists.deleteList}
              </button>
            </ConfirmForm>
          </div>
        ) : (
          <AppLink
            href={`/users/${list.user.id}`}
            className="small text-secondary text-decoration-none"
          >
            {list.user.name ? t.lists.artists.ofUser(list.user.name) : t.lists.artists.ofFriend}
          </AppLink>
        )}
      </div>

      {isOwner && (
        <div className="mb-4" style={{ maxWidth: "26rem" }}>
          <AddPerformerBox listId={list.id} />
        </div>
      )}

      {list.items.length === 0 ? (
        <EmptyState
          emoji="👥"
          title={t.lists.artists.emptyTitle}
          hint={isOwner ? t.lists.artists.emptyHintOwn : t.lists.artists.emptyHintGuest}
          compact
        />
      ) : (
        <div className="d-flex flex-wrap gap-2">
          {list.items.map((i) => (
            <div key={i.performerId} className="position-relative">
              <EntityMiniCard
                href={performerHref(i.performer)}
                photoUrl={i.performer.photoUrl}
                name={i.performer.name}
                subtitle={i.performer.realName}
              />
              {isOwner && (
                <form
                  action={removePerformerFromList.bind(null, list.id, i.performerId)}
                  className="position-absolute"
                  style={{ top: "-0.4rem", right: "-0.4rem" }}
                >
                  <button
                    type="submit"
                    className="icon-btn"
                    style={{ width: "1.5rem", height: "1.5rem", fontSize: "0.7rem" }}
                    aria-label={t.lists.artists.removeAria(i.performer.name)}
                  >
                    ×
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
