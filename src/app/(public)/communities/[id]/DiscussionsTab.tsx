import EmptyState from "@/components/EmptyState";
import { getT } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { communityHref } from "@/lib/slugHelpers";
import { getCurrentUser } from "@/lib/userAuth";
import PostCard from "./PostCard";
import type { PostViewer } from "./PostComment";
import PostForm from "./PostForm";

/**
 * Вкладка «Обсуждения» — СПИСОК тем сообщества (АА25, этап 2; см.
 * docs/features/communities.md).

 * Список, а не лента с раскрытыми комментариями: раньше все темы вместе
 * со всеми ответами и картинками лежали на одной вкладке, и читать её
 * было нечем — «если там будет 100500 фоток, то как листать» (жалоба
 * владельца 2026-09-08). Сама тема открывается своей страницей
 * `/communities/<slug>/posts/<id>`.
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
        id: true,
        // Слаг — чтобы ссылка на тему выглядела как остальные ссылки
        // сайта, а не как строка из cuid'ов.
        slug: true,
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
      select: {
        id: true,
        title: true,
        text: true,
        pinned: true,
        createdAt: true,
        author: { select: { id: true, name: true, photoUrl: true, deletedAt: true } },
        // Комментарии считаются в базе, а не тянутся сюда: списку нужно
        // одно число на строку, а не сами реплики с картинками.
        // Носитель картинок темы из счёта выкинут — он служебный
        _count: { select: { comments: true } },
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
  const base = community ? communityHref(community) : "";

  return (
    <div className="d-flex flex-column gap-2">
      {viewer.canPost && <PostForm communityId={communityId} />}

      {posts.length === 0 ? (
        <EmptyState
          emoji="💬"
          title={s.emptyTitle}
          hint={viewer.canPost ? s.emptyHint : s.emptyHintReadOnly}
          compact
        />
      ) : (
        posts.map((post) => (
          <PostCard
            key={post.id}
            post={{ ...post, commentCount: post._count.comments }}
            href={`${base}/posts/${post.id}`}
            viewer={viewer}
          />
        ))
      )}
    </div>
  );
}
