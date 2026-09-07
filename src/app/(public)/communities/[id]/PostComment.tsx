import CommentLikeButton from "@/components/CommentLikeButton";
import CommentPhotos from "@/components/CommentPhotos";
import ConfirmForm from "@/components/ConfirmForm";
import LetterAvatar from "@/components/LetterAvatar";
import ReportButton from "@/components/ReportButton";
import { TrashIcon } from "@/components/icons";
import { formatDateWithYear } from "@/lib/dates";
import { getT } from "@/lib/i18n";
import { deletePostComment } from "@/app/(public)/communities/postActions";
import PostCommentForm from "./PostCommentForm";

/**
 * Одна реплика в теме обсуждения: аватар, текст, картинки, лайк, ответ,
 * жалоба, удаление.
 *
 * Серверный компонент: он только рисует то, что уже выбрала страница
 * темы, а все действия — server actions, которые заново проверяют
 * права. Скрытая кнопка правом не является (см. postActions.ts).
 *
 * Типы зрителя и реплики живут здесь, а не в карточке списка: это тот
 * кусок обсуждений, который знает про КАЖДОЕ право зрителя, а список
 * тем комментариев вовсе не показывает.
 */

export type PostCommentRow = {
  id: string;
  text: string;
  createdAt: Date;
  user: { id: string; name: string | null; photoUrl: string | null; deletedAt: Date | null };
  likes: { userId: string }[];
  photos: { id: string; url: string }[];
  replies?: PostCommentRow[];
};

export type PostViewer = {
  id: string;
  isAdmin: boolean;
  /** Владелец сообщества или модератор: закрепляет темы и убирает чужое. */
  canManage: boolean;
  /** Принятый участник — только ему показываем формы. */
  canPost: boolean;
};

export default async function PostComment({
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
    // id — якорь: ссылка из уведомления об ответе ведёт на страницу
    // темы, и попасть надо в саму реплику, а не в её начало.
    <div id={`comment-${c.id}`} className="d-flex align-items-start gap-2">
      <LetterAvatar name={authorName} photoUrl={c.user.photoUrl} size={2} />
      <div className="flex-fill" style={{ minWidth: 0 }}>
        <p className="small mb-1">
          <span className="text-white fw-medium">{displayName}</span>
          <span className="text-secondary"> · {formatDateWithYear(c.createdAt, locale)}</span>
        </p>
        <p className="mb-1" style={{ whiteSpace: "pre-wrap" }}>
          {c.text}
        </p>
        <CommentPhotos photos={c.photos} />
        <div className="d-flex align-items-center gap-3 flex-wrap mt-1">
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
              <div className="mt-2">
                <PostCommentForm
                  postId={postId}
                  parentId={replyToId ?? c.id}
                  placeholder={s.replyPlaceholder(displayName)}
                  ariaLabel={s.replyAria(displayName)}
                  rows={2}
                />
              </div>
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
