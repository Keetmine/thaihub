import EmptyState from "@/components/EmptyState";
import { getT } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import PostCard, { type PostViewer } from "./PostCard";
import PostForm from "./PostForm";

/**
 * Вкладка «Обсуждения» — темы сообщества и комментарии к ним (АА25,
 * этап 2; см. docs/features/communities.md).
 *
 * Вкладка рисуется только тем, кто внутри сообщества: наружу обсуждения
 * не уходят ни гостю, ни поисковику (правило «витрина — всем,
 * содержимое — участникам», `communityAccess`). Права на запись всё
 * равно перепроверяются в каждом экшене — скрытая кнопка правом не
 * является (см. postActions.ts).
 *
 * Роль зрителя читается здесь, а не приходит пропсом: страница отдаёт
 * вкладке только `canPost`, а закреп и удаление чужого зависят ещё и от
 * роли (владелец/модератор), и от админского флага.
 */
export default async function DiscussionsTab({
  communityId,
  canPost,
}: {
  communityId: string;
  canPost: boolean;
}) {
  const { t } = await getT();
  const s = t.communities.posts;
  const user = await getCurrentUser();

  const [community, posts] = await Promise.all([
    prisma.community.findUnique({
      where: { id: communityId },
      select: {
        ownerId: true,
        // Гостя тут быть не должно (вкладка рисуется только участникам),
        // но пустой id — честный «ничего не нашлось», а не падение.
        members: {
          where: { userId: user?.id ?? "" },
          select: { role: true, status: true },
        },
      },
    }),
    prisma.communityPost.findMany({
      where: { communityId },
      include: {
        author: { select: { id: true, name: true, photoUrl: true, deletedAt: true } },
        // Комментарии одной выборкой вместе с темами: отдельный запрос на
        // каждую тему — это N+1 на ленте из полусотни обсуждений.
        comments: {
          where: { parentId: null },
          include: {
            user: { select: { id: true, name: true, photoUrl: true, deletedAt: true } },
            likes: { select: { userId: true } },
            replies: {
              include: {
                user: { select: { id: true, name: true, photoUrl: true, deletedAt: true } },
                likes: { select: { userId: true } },
              },
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      // Закреплённые сверху, дальше свежие: закреп для того и нужен,
      // чтобы правила и знакомство не тонули под новыми темами.
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 50,
    }),
  ]);

  const membership = community?.members[0];
  const isOwner = !!user && community?.ownerId === user.id;
  const viewer: PostViewer = {
    id: user?.id ?? "",
    isAdmin: !!user?.isAdmin,
    canManage: isOwner || membership?.role === "MODERATOR",
    // Пропс страницы и наша собственная проверка должны сойтись: если
    // страница уже решила, что зритель не участник, форм не будет.
    canPost: canPost && (isOwner || membership?.status === "ACTIVE"),
  };

  return (
    <div className="d-flex flex-column gap-3">
      {viewer.canPost && <PostForm communityId={communityId} />}

      {posts.length === 0 ? (
        <EmptyState
          emoji="💬"
          title={s.emptyTitle}
          hint={viewer.canPost ? s.emptyHint : s.emptyHintReadOnly}
          compact
        />
      ) : (
        posts.map((post) => <PostCard key={post.id} post={post} viewer={viewer} />)
      )}
    </div>
  );
}
