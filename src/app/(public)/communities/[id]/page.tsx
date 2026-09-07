import { notFound } from "next/navigation";
import AppLink from "@/components/AppLink";
import BackLink from "@/components/BackLink";
import ConfirmForm from "@/components/ConfirmForm";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { getT } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { slugOrIdWhere } from "@/lib/slugHelpers";
import { communityAccess } from "@/lib/communities";
import { leaveCommunity } from "../actions";
import JoinButton from "./JoinButton";
import MemberRequests from "./MemberRequests";
import CommunityAdmin from "./CommunityAdmin";

export const dynamic = "force-dynamic";

/** Общая выборка страницы: и метаданным, и самой странице нужно одно и
 *  то же, а запрос тут не из дешёвых. */
async function loadCommunity(param: string) {
  return prisma.community.findFirst({
    where: slugOrIdWhere(param),
    include: {
      owner: { select: { id: true, name: true } },
      links: { orderBy: { createdAt: "asc" } },
      members: {
        include: { user: { select: { id: true, name: true, photoUrl: true, username: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { t } = await getT();
  const community = await loadCommunity(id);
  if (!community) {
    return pageMetadata({
      title: t.communities.errors.notFound,
      description: t.communities.metaDescription,
      noIndex: true,
    });
  }
  return pageMetadata({
    title: community.title,
    description: community.description ?? t.communities.metaDescription,
    path: `/communities/${community.slug ?? community.id}`,
    // Закрытое сообщество поисковикам не отдаём: его и в списке нет.
    noIndex: community.visibility === "PRIVATE",
  });
}

/**
 * Страница сообщества (АА25).
 *
 * Витрина — всем, содержимое — участникам: внутри живут ссылки на
 * закрытые чаты, а дальше появятся встречи с адресами (см.
 * docs/features/communities.md). Гость видит обложку, название,
 * описание и число участников — этого хватает, чтобы захотеть войти, и
 * не хватает, чтобы что-то утекло.
 */
export default async function CommunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { t } = await getT();
  const s = t.communities;
  const community = await loadCommunity(id);
  if (!community) notFound();

  const viewer = await getCurrentUser();
  const membership = viewer ? community.members.find((m) => m.userId === viewer.id) : undefined;
  const access = communityAccess(
    community,
    viewer?.id ?? null,
    membership ? { role: membership.role, status: membership.status } : null,
  );

  const active = community.members.filter((m) => m.status === "ACTIVE");
  const pending = community.members.filter((m) => m.status === "PENDING");

  return (
    <div>
      <BackLink fallbackHref="/communities" fallbackLabel={s.heading} />

      {/* Приветственный баннер: обложка, если её загрузили, иначе тёплая
          заливка — пустой серый прямоугольник смотрелся бы поломкой. */}
      <section className="community-hero mb-4">
        {community.coverUrl && (
          <span className="community-hero-cover" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={community.coverUrl} alt="" loading="eager" decoding="async" />
          </span>
        )}
        <span className="community-hero-scrim" aria-hidden />
        <div className="community-hero-body">
          <h1 className="display-1-tight mb-1">{community.title}</h1>
          <p className="small text-secondary mb-0">
            {s.membersCount(active.length)}
            {community.visibility === "PRIVATE" && ` · ${s.visibility.PRIVATE}`}
          </p>
        </div>
      </section>

      <div style={{ maxWidth: "44rem" }}>
        {community.description && (
          <p className="text-secondary" style={{ whiteSpace: "pre-line" }}>
            {community.description}
          </p>
        )}

        <div className="d-flex flex-wrap gap-2 mb-4">
          {access.canJoin && (
            <JoinButton
              communityId={community.id}
              needsApproval={community.joinMode === "APPROVAL"}
            />
          )}
          {access.isPending && <span className="date-chip">{s.pending}</span>}
          {access.isMember && !access.isOwner && (
            <ConfirmForm
              action={leaveCommunity.bind(null, community.id)}
              confirmMessage={s.leaveConfirm}
              confirmLabel={s.leave}
            >
              <button type="button" className="btn btn-ghost btn-sm">
                {s.leave}
              </button>
            </ConfirmForm>
          )}
          {access.canManage && (
            <CommunityAdmin
              communityId={community.id}
              isOwner={access.isOwner}
              community={{
                title: community.title,
                description: community.description,
                visibility: community.visibility,
                joinMode: community.joinMode,
              }}
              links={community.links}
            />
          )}
        </div>

        {access.canSeeInside ? (
          <>
            {access.canManage && pending.length > 0 && (
              <MemberRequests
                communityId={community.id}
                requests={pending.map((m) => ({
                  userId: m.userId,
                  name: m.user.name ?? t.common.deletedAccount,
                }))}
              />
            )}

            {community.links.length > 0 && (
              <section className="mb-4">
                <h2 className="section-heading mb-2">{s.linksTitle}</h2>
                <div className="d-flex flex-column gap-2">
                  {community.links.map((l) => (
                    <a
                      key={l.id}
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="surface surface-hover text-decoration-none p-2 px-3"
                    >
                      {l.label} ↗
                    </a>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h2 className="section-heading mb-2">{s.members}</h2>
              <div className="d-flex flex-column gap-2">
                {active.map((m) => (
                  <div
                    key={m.userId}
                    className="surface d-flex align-items-center gap-2 p-2 px-3"
                  >
                    <AppLink
                      href={`/users/${m.user.username ?? m.user.id}`}
                      className="text-decoration-none text-white"
                    >
                      {m.user.name ?? t.common.deletedAccount}
                    </AppLink>
                    {m.role !== "MEMBER" && (
                      <span className="small text-secondary">
                        {m.role === "OWNER" ? s.owner : s.moderator}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : (
          // Приватному сообществу не рассказываем даже, что внутри есть
          // участники и ссылки: снаружи оно просто закрыто.
          <div className="surface p-3">
            <p className="fw-medium text-white mb-1">
              {community.visibility === "PRIVATE" ? s.privateTitle : s.insideLockedTitle}
            </p>
            <p className="small text-secondary mb-0">
              {community.visibility === "PRIVATE" ? s.privateHint : s.insideLockedHint}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
