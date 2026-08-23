import Link from "next/link";
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

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const list = await prisma.performerList.findFirst({
    where: slugOrIdWhere(rawId),
    select: { title: true, description: true },
  });
  if (!list)
    return pageMetadata({
      title: "Список актёров",
      description: "Список не найден.",
      noIndex: true,
    });
  return pageMetadata({
    title: list.title,
    description:
      list.description?.slice(0, 160) ??
      `«${list.title}» — пользовательский список актёров на MyBLHub.`,
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
      if (!user) redirect("/login");
      const ownerFriendIds = await getFriendIds(list.userId);
      if (!ownerFriendIds.includes(user.id)) notFound();
    }
  }

  return (
    <div>
      <BackLink fallbackHref="/lists" fallbackLabel="← Мои списки" />

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
              confirmMessage={`Удалить список «${list.title}»?`}
            >
              <button type="button" className="btn btn-outline-secondary btn-sm">
                Удалить список
              </button>
            </ConfirmForm>
          </div>
        ) : (
          <Link
            href={`/users/${list.user.id}`}
            className="small text-secondary text-decoration-none"
          >
            Список {list.user.name ? `пользователя ${list.user.name}` : "друга"} →
          </Link>
        )}
      </div>

      {isOwner && (
        <div className="mb-4" style={{ maxWidth: "26rem" }}>
          <AddPerformerBox listId={list.id} />
        </div>
      )}

      {list.items.length === 0 ? (
        <p className="text-secondary">
          {isOwner ? "Добавьте первого актёра через поиск выше." : "Список пуст."}
        </p>
      ) : (
        <div className="d-flex flex-wrap gap-2 scroll-list-lg thin-scroll">
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
                    aria-label={`Убрать ${i.performer.name}`}
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
