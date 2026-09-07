import AppLink from "@/components/AppLink";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import PremiumUpsell from "@/components/PremiumUpsell";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import { isPremiumActive } from "@/lib/premium";
import { communityHref } from "@/lib/slugHelpers";
import { pageMetadata } from "@/lib/seo";
import { getT } from "@/lib/i18n";
import CreateCommunityButton from "./CreateCommunityButton";

export async function generateMetadata() {
  const { t } = await getT();
  return pageMetadata({
    title: t.communities.metaTitle,
    description: t.communities.metaDescription,
    path: "/communities",
  });
}

export const dynamic = "force-dynamic";

/**
 * Витрина сообществ (АА25).
 *
 * Открыта всем, включая поисковики: человек ищет «лакорны Беларусь»,
 * находит страницу и заводит аккаунт, чтобы вступить. Поэтому в списке
 * только ПУБЛИЧНЫЕ сообщества — закрытые не показываются даже
 * названием, попасть в них можно лишь по прямой ссылке.
 *
 * Порядок — по числу участников, а не по дате: пустое сообщество,
 * заведённое вчера, наверху витрины выглядит хуже, чем его отсутствие.
 */
export default async function CommunitiesPage() {
  const { t } = await getT();
  const user = await getCurrentUser();

  const [publicCommunities, mine] = await Promise.all([
    prisma.community.findMany({
      where: { visibility: "PUBLIC" },
      include: { _count: { select: { members: { where: { status: "ACTIVE" } } } } },
      take: 100,
    }),
    user
      ? prisma.community.findMany({
          // Свои — и те, что завёл, и те, куда вступил, включая закрытые:
          // человеку они видны всегда.
          where: { members: { some: { userId: user.id, status: "ACTIVE" } } },
          include: { _count: { select: { members: { where: { status: "ACTIVE" } } } } },
        })
      : Promise.resolve([]),
  ]);

  const byMembers = <T extends { _count: { members: number }; title: string }>(rows: T[]) =>
    [...rows].sort((a, b) => b._count.members - a._count.members || a.title.localeCompare(b.title));

  const mineIds = new Set(mine.map((c) => c.id));
  const others = byMembers(publicCommunities.filter((c) => !mineIds.has(c.id)));
  const canCreate = isPremiumActive(user);

  const card = (c: {
    id: string;
    slug: string | null;
    title: string;
    description: string | null;
    _count: { members: number };
  }) => (
    <AppLink
      key={c.id}
      href={communityHref(c)}
      className="surface surface-hover text-decoration-none d-flex flex-column gap-1 p-3"
    >
      <span className="font-display fw-medium text-white">{c.title}</span>
      {c.description && (
        <span className="small text-secondary text-truncate">{c.description}</span>
      )}
      <span className="small text-secondary">{t.communities.membersCount(c._count.members)}</span>
    </AppLink>
  );

  return (
    <div>
      <PageHeader
        eyebrow={t.communities.eyebrow}
        title={t.communities.heading}
        size="lg"
        className="mb-4"
        action={canCreate ? <CreateCommunityButton /> : undefined}
      />

      <div style={{ maxWidth: "44rem" }}>
        <p className="text-secondary mb-3">{t.communities.intro}</p>

        {/* Заводить сообщество — часть подписки; вступать и участвовать
            можно без неё (решение владельца). */}
        {user && !canCreate && (
          <div className="mb-4">
            <PremiumUpsell feature={t.communities.create} />
          </div>
        )}

        {mine.length > 0 && (
          <section className="mb-4">
            <h2 className="section-heading mb-2">{t.communities.myCommunities}</h2>
            <div className="d-flex flex-column gap-2">{byMembers(mine).map(card)}</div>
          </section>
        )}

        {others.length > 0 && (
          <section>
            {mine.length > 0 && (
              <h2 className="section-heading mb-2">{t.communities.allCommunities}</h2>
            )}
            <div className="d-flex flex-column gap-2">{others.map(card)}</div>
          </section>
        )}

        {mine.length === 0 && others.length === 0 && (
          <EmptyState
            emoji="🫂"
            title={t.communities.emptyTitle}
            hint={t.communities.emptyHint}
            compact
          />
        )}
      </div>
    </div>
  );
}
