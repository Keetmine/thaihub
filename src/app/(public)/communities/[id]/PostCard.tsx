import ActionResultForm from "@/components/ActionResultForm";
import CommentLikeButton from "@/components/CommentLikeButton";
import ConfirmForm from "@/components/ConfirmForm";
import LetterAvatar from "@/components/LetterAvatar";
import ReportButton from "@/components/ReportButton";
import { PinIcon, TrashIcon } from "@/components/icons";
import { formatDateWithYear } from "@/lib/dates";
import { getT } from "@/lib/i18n";
import {
  addPostComment,
  deletePost,
  deletePostComment,
  togglePostPin,
} from "@/app/(public)/communities/postActions";

/**
 * Одна тема обсуждения с комментариями.
 *
 * Серверный компонент: он только рисует то, что уже выбрала вкладка, а
 * все действия — server actions, которые заново проверяют права. Скрытая
 * кнопка правом не является: страница сообщества открывается и гостю,
 * форму можно отправить и мимо интерфейса (см. postActions.ts).
 */

export type PostCommentRow = {
  id: string;
  text: string;
  createdAt: Date;
  user: { id: string; name: string | null; photoUrl: string | null; deletedAt: Date | null };
  likes: { userId: string }[];
  replies?: PostCommentRow[];
};

export type PostRow = {
  id: string;
  title: string | null;
  text: string;
  pinned: boolean;
  createdAt: Date;
  author: { id: string; name: string | null; photoUrl: string | null; deletedAt: Date | null };
  comments: PostCommentRow[];
};

export type PostViewer = {
  id: string;
  isAdmin: boolean;
  /** Владелец сообщества или модератор: закрепляет темы и убирает чужое. */
  canManage: boolean;
  /** Принятый участник — только ему показываем формы. */
  canPost: boolean;
};

/** Одна реплика: аватар, текст, лайк, ответ, жалоба, удаление. */
async function CommentRow({
  comment: c,
  postId,
  viewer,
  /** Ответ на ответ цепляется к корню треда — вложенность у нас в один
   *  уровень, как в комментариях к сериалам. */
  replyToId,
  canReply,
}: {
  comment: PostCommentRow;
  postId: string;
  viewer: PostViewer;
  replyToId?: string;
  canReply: boolean;
}) {
  const { t, locale } = await getT();
  const s = t.communities.posts;
  // Удалённый аккаунт подписываем на языке зрителя: в базе у него лежит
  // имя, записанное в момент удаления (см. src/lib/userDeletion.ts).
  const authorName = c.user.deletedAt ? t.common.deletedAccount : c.user.name;
  const displayName = authorName ?? t.reviews.noName;
  const canDelete = viewer.isAdmin || viewer.canManage || c.user.id === viewer.id;

  return (
    <div className="d-flex align-items-start gap-2">
      <LetterAvatar name={authorName} photoUrl={c.user.photoUrl} size={2} />
      <div className="flex-fill" style={{ minWidth: 0 }}>
        <p className="small mb-1">
          <span className="text-white fw-medium">{displayName}</span>
          <span className="text-secondary"> · {formatDateWithYear(c.createdAt, locale)}</span>
        </p>
        <p className="mb-1" style={{ whiteSpace: "pre-wrap" }}>
          {c.text}
        </p>
        <div className="d-flex align-items-center gap-3 flex-wrap">
          <CommentLikeButton
            commentId={c.id}
            initialCount={c.likes.length}
            initiallyLiked={c.likes.some((l) => l.userId === viewer.id)}
            disabled={!viewer.canPost}
          />
          {viewer.canPost && (canReply || replyToId) && (
            <details>
              <summary
                className="small text-secondary"
                style={{ cursor: "pointer", listStyle: "none" }}
              >
                {s.reply}
              </summary>
              <ActionResultForm
                action={addPostComment.bind(null, postId)}
                className="d-flex gap-2 mt-2 flex-wrap"
              >
                <input type="hidden" name="parentId" value={replyToId ?? c.id} />
                <input
                  name="text"
                  required
                  maxLength={3000}
                  placeholder={s.replyPlaceholder(displayName)}
                  aria-label={s.replyAria(displayName)}
                  className="form-control form-control-sm"
                />
                <button type="submit" className="btn btn-primary btn-sm flex-shrink-0">
                  {s.send}
                </button>
              </ActionResultForm>
            </details>
          )}
          {c.user.id !== viewer.id && <ReportButton targetType="comment" targetId={c.id} />}
        </div>
      </div>
      {canDelete && (
        <ConfirmForm
          action={deletePostComment.bind(null, c.id)}
          confirmMessage={s.deleteCommentConfirm}
        >
          <button
            type="button"
            className="icon-btn icon-btn-danger flex-shrink-0"
            aria-label={s.deleteComment}
          >
            <TrashIcon />
          </button>
        </ConfirmForm>
      )}
    </div>
  );
}

export default async function PostCard({
  post,
  viewer,
}: {
  post: PostRow;
  viewer: PostViewer;
}) {
  const { t, locale } = await getT();
  const s = t.communities.posts;
  const authorName = post.author.deletedAt ? t.common.deletedAccount : post.author.name;
  const total = post.comments.reduce((sum, c) => sum + 1 + (c.replies?.length ?? 0), 0);
  const canDelete = viewer.isAdmin || viewer.canManage || post.author.id === viewer.id;

  return (
    // id — якорь для ссылки из уведомления о новой теме.
    <article id={`post-${post.id}`} className="surface p-3">
      <div className="d-flex align-items-start gap-2">
        <LetterAvatar name={authorName} photoUrl={post.author.photoUrl} size={2.25} />
        <div className="flex-fill" style={{ minWidth: 0 }}>
          <p className="small mb-1">
            <span className="text-white fw-medium">{authorName ?? t.reviews.noName}</span>
            <span className="text-secondary"> · {formatDateWithYear(post.createdAt, locale)}</span>
            {post.pinned && (
              <span className="date-chip ms-2 align-middle d-inline-flex align-items-center gap-1">
                <PinIcon /> {s.pinned}
              </span>
            )}
          </p>
          {post.title && <h3 className="h6 text-white mb-1">{post.title}</h3>}
          <p className="mb-2" style={{ whiteSpace: "pre-wrap" }}>
            {post.text}
          </p>
        </div>
        <div className="d-flex align-items-start gap-1 flex-shrink-0">
          {/* Закреп — только владелец и модератор: право решать, что
              висит наверху, принадлежит хозяевам сообщества. */}
          {viewer.canManage && (
            // ActionResultForm, а не голый <form>: экшен возвращает
            // ошибку значением (текст исключения из server action в
            // проде до клиента не доезжает), и голой форме её некуда деть.
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
            <ConfirmForm action={deletePost.bind(null, post.id)} confirmMessage={s.deletePostConfirm}>
              <button type="button" className="icon-btn icon-btn-danger" aria-label={s.deletePost}>
                <TrashIcon />
              </button>
            </ConfirmForm>
          )}
        </div>
      </div>

      <div className="d-flex align-items-center gap-3 flex-wrap">
        {post.author.id !== viewer.id && (
          <ReportButton targetType="communityPost" targetId={post.id} />
        )}
      </div>

      {/* Комментарии свёрнуты: в списке тем важнее сами темы, а
          развёрнутые треды растянули бы ленту на экраны. */}
      <details className="mt-2">
        <summary className="small text-secondary" style={{ cursor: "pointer" }}>
          {s.commentsCount(total)}
        </summary>
        <div className="d-flex flex-column gap-3 mt-3">
          {post.comments.length === 0 && (
            <p className="small text-secondary mb-0">{s.noComments}</p>
          )}
          {post.comments.map((c) => (
            <div key={c.id}>
              <CommentRow comment={c} postId={post.id} viewer={viewer} canReply />
              {(c.replies?.length ?? 0) > 0 && (
                <div
                  className="d-flex flex-column gap-2 mt-2 ms-4 ps-3"
                  style={{ borderLeft: "2px solid var(--bs-border-color)" }}
                >
                  {c.replies!.map((r) => (
                    <CommentRow
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
            <ActionResultForm
              action={addPostComment.bind(null, post.id)}
              className="d-flex flex-column gap-2"
            >
              <textarea
                name="text"
                rows={2}
                required
                maxLength={3000}
                placeholder={s.commentPlaceholder}
                aria-label={s.commentAria}
                className="form-control"
              />
              <button type="submit" className="btn btn-primary btn-sm align-self-start">
                {s.send}
              </button>
            </ActionResultForm>
          )}
        </div>
      </details>
    </article>
  );
}
