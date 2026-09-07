import { notFound } from "next/navigation";
import { cache } from "react";
import BackLink from "@/components/BackLink";
import ActionResultForm from "@/components/ActionResultForm";
import CommentPhotos from "@/components/CommentPhotos";
import PostEditForm from "../../PostEditForm";
import ConfirmForm from "@/components/ConfirmForm";
import LetterAvatar from "@/components/LetterAvatar";
import ReportButton from "@/components/ReportButton";
import { PinIcon, TrashIcon } from "@/components/icons";
import { communityAccess } from "@/lib/communities";
import { formatDateWithYear } from "@/lib/dates";
import { getT } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { pageMetadata } from "@/lib/seo";
import { communityHref } from "@/lib/slugHelpers";
import { getCurrentUser } from "@/lib/userAuth";
import { deletePost, togglePostPin } from "@/app/(public)/communities/postActions";
import PostComment, { type PostCommentRow, type PostViewer } from "../../PostComment";
import PostCommentForm from "../../PostCommentForm";

export const dynamic = "force-dynamic";

/**
 * Страница одной темы обсуждения (АА25).
 *
 * Зачем отдельная страница. До неё все темы с комментариями лежали на
 * вкладке сообщества одной лентой: «если там будет 100500 фоток, то как
 * листать» (жалоба владельца 2026-09-08). Теперь вкладка — список тем,
 * а разговор со всеми ответами и картинками живёт своим адресом, на
 * который ведут и список, и уведомление `COMMUNITY_POST`.
 *
 * Доступ — РОВНО ТОТ ЖЕ, что у вкладки: `communityAccess(...).canSeeInside`,
 * то есть только действующие участники и владелец. Постороннему и гостю
 * отдаётся `notFound()`, а не страница без кнопок: обсуждения — это
 * содержимое сообщества, а «витрина — всем, содержимое — участникам»
 * (см. docs/features/communities.md). Проверка стоит и в
 * `generateMetadata`: иначе заголовок закрытой темы уехал бы в `<title>`
 * страницы-404 — та же история, что у встреч сообщества.
 *
 * Поисковикам страница не отдаётся никогда (`noIndex`), даже у
 * публичного сообщества: публична у него витрина, а не разговоры внутри.
 */

/** React.cache: `generateMetadata` и сама страница делят один запрос на
 *  HTTP-запрос — как на странице события. */
const loadPost = cache(async (postId: string) => {
  const commentInclude = {
    user: { select: { id: true, name: true, photoUrl: true, deletedAt: true } },
    likes: { select: { userId: true } },
    photos: { select: { id: true, url: true }, orderBy: { sort: "asc" as const } },
  };
  return prisma.communityPost.findUnique({
    where: { id: postId },
    include: {
      author: { select: { id: true, name: true, photoUrl: true, deletedAt: true } },
      // Картинки самой темы — своей связью: раньше они висели на
      // служебном комментарии, и его приходилось выкидывать из ленты и
      // из счётчиков вручную.
      photos: { orderBy: { sort: "asc" as const } },
      // Сообщество нужно целиком для правила доступа: `communityAccess`
      // считает по видимости, владельцу и членству — одной функцией на
      // весь сайт, второй копии условий не заводим.
      community: {
        select: { id: true, slug: true, title: true, ownerId: true, visibility: true, joinMode: true },
      },
      comments: {
        where: { parentId: null },
        include: { ...commentInclude, replies: { include: commentInclude, orderBy: { createdAt: "asc" } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
});

/** Тема + права зрителя, или `null` — и вызывающий отдаёт 404. Одно
 *  место на страницу и метаданные: разъехавшиеся проверки доступа — это
 *  утечка, а не косметика. */
const loadVisiblePost = cache(async (communityParam: string, postId: string) => {
  const post = await loadPost(postId);
  if (!post) return null;

  // Тема из другого сообщества по этому адресу не открывается: ссылка
  // `/communities/A/posts/<тема из B>` иначе показывала бы содержимое B
  // тому, кто состоит в A.
  const c = post.community;
  const matchesCommunity =
    communityParam === c.slug || communityParam === c.id || communityParam.startsWith(`${c.id}-`);
  if (!matchesCommunity) return null;

  const viewer = await getCurrentUser();
  const membership = viewer
    ? await prisma.communityMember.findUnique({
        where: { communityId_userId: { communityId: c.id, userId: viewer.id } },
        select: { role: true, status: true },
      })
    : null;
  // Админ сайта заходит в закрытое сообщество читать, а не участвовать:
  // без этого модерация упиралась бы в собственную страницу-404
  // (см. communityAccess).
  const access = communityAccess(c, viewer?.id ?? null, membership, {
    isSiteAdmin: !!viewer?.isAdmin,
  });
  if (!access.canSeeInside) return null;

  return { post, viewer, access };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; postId: string }>;
}) {
  const { id, postId } = await params;
  const { t } = await getT();
  const found = await loadVisiblePost(id, postId);
  // Не пустили — не рассказываем и заголовком, о чём тема.
  if (!found) {
    return pageMetadata({
      title: t.communities.posts.errors.postNotFound,
      description: t.communities.metaDescription,
      noIndex: true,
    });
  }
  return pageMetadata({
    title: postTitle(found.post),
    description: t.communities.metaDescription,
    // Никогда не в индекс: разговоры внутри сообщества — содержимое, а
    // не витрина.
    noIndex: true,
  });
}

/** Заголовка может не быть намеренно — тогда вывеской служит начало
 *  текста (то же правило, что в строке списка тем). */
function postTitle(post: { title: string | null; text: string }): string {
  if (post.title) return post.title;
  return post.text.length > 90 ? `${post.text.slice(0, 90).trimEnd()}…` : post.text;
}

export default async function CommunityPostPage({
  params,
}: {
  params: Promise<{ id: string; postId: string }>;
}) {
  const { id, postId } = await params;
  const { t, locale } = await getT();
  const s = t.communities.posts;

  const found = await loadVisiblePost(id, postId);
  if (!found) notFound();
  const { post, viewer: user, access } = found;

  const viewer: PostViewer = {
    id: user?.id ?? "",
    isAdmin: !!user?.isAdmin,
    canManage: access.canManage,
    canPost: access.isMember,
  };

  // Первый комментарий может быть служебным носителем картинок темы
  const comments: PostCommentRow[] = post.comments;
  const total = comments.reduce((sum, c) => sum + 1 + (c.replies?.length ?? 0), 0);

  const authorName = post.author.deletedAt ? t.common.deletedAccount : post.author.name;
  const canDelete = viewer.isAdmin || viewer.canManage || post.author.id === viewer.id;

  // Без потолка ширины (правка владельца 2026-09-08: «поля во всю
  // ширину»): у темы бывают картинки и длинные обсуждения, а колонка в
  // 46rem держала форму вдвое уже страницы. Ширину задаёт общий
  // контейнер страницы.
  return (
    <div>
      <BackLink
        fallbackHref={`${communityHref(post.community)}?tab=discussions`}
        fallbackLabel={post.community.title}
      />

      <article className="surface p-3 mt-3">
        <div className="d-flex align-items-start gap-2">
          <LetterAvatar name={authorName} photoUrl={post.author.photoUrl} size={2.25} />
          <div className="flex-fill" style={{ minWidth: 0 }}>
            <p className="small mb-1">
              <span className="text-white fw-medium">{authorName ?? t.reviews.noName}</span>
              <span className="text-secondary">
                {" "}
                · {formatDateWithYear(post.createdAt, locale)}
              </span>
              {post.pinned && (
                <span className="date-chip ms-2 align-middle d-inline-flex align-items-center gap-1">
                  <PinIcon /> {s.pinned}
                </span>
              )}
            </p>
            {post.title && <h1 className="h5 text-white mb-2">{post.title}</h1>}
            <p className="mb-2" style={{ whiteSpace: "pre-wrap" }}>
              {post.text}
            </p>
            <CommentPhotos photos={post.photos} />
            {/* Править может автор, владелец и модератор сообщества,
                админ сайта. Право перепроверяется в экшене — кнопка
                правом не является. */}
            {canDelete && (
              <PostEditForm
                postId={post.id}
                initial={{ title: post.title, text: post.text, isPrivate: post.isPrivate }}
              />
            )}
          </div>
          <div className="d-flex align-items-start gap-1 flex-shrink-0">
            {viewer.canManage && (
              <ActionResultForm action={togglePostPin.bind(null, post.id)}>
                <button
                  type="submit"
                  className={`icon-btn ${post.pinned ? "text-white" : ""}`}
                  aria-label={post.pinned ? s.unpin : s.pin}
                  title={post.pinned ? s.unpin : s.pin}
                >
                  <PinIcon />
                </button>
              </ActionResultForm>
            )}
            {canDelete && (
              // true — «удаляют со страницы темы»: после удаления
              // оставаться тут не на чем, экшен уводит в список.
              <ConfirmForm
                action={deletePost.bind(null, post.id, true)}
                confirmMessage={s.deletePostConfirm}
              >
                <button
                  type="button"
                  className="icon-btn icon-btn-danger"
                  aria-label={s.deletePost}
                >
                  <TrashIcon />
                </button>
              </ConfirmForm>
            )}
          </div>
        </div>

        {post.author.id !== viewer.id && (
          <ReportButton targetType="communityPost" targetId={post.id} />
        )}
      </article>

      <section className="mt-4">
        <h2 className="section-heading mb-3">
          {s.commentsHeading}
          {total > 0 && <span className="text-secondary"> ({total})</span>}
        </h2>
        <div className="d-flex flex-column gap-3">
          {comments.length === 0 && <p className="small text-secondary mb-0">{s.noComments}</p>}
          {comments.map((c) => (
            <div key={c.id}>
              <PostComment comment={c} postId={post.id} viewer={viewer} canReply />
              {(c.replies?.length ?? 0) > 0 && (
                <div
                  className="d-flex flex-column gap-3 mt-3 ms-4 ps-3"
                  style={{ borderLeft: "2px solid var(--bs-border-color)" }}
                >
                  {c.replies!.map((r) => (
                    <PostComment
                      key={r.id}
                      comment={r}
                      postId={post.id}
                      viewer={viewer}
                      canReply={false}
                      replyToId={c.id}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}

          {viewer.canPost && (
            <div className="surface p-3">
              <PostCommentForm
                postId={post.id}
                placeholder={s.commentPlaceholder}
                ariaLabel={s.commentAria}
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
