import ActionResultForm from "@/components/ActionResultForm";
import AppLink from "@/components/AppLink";
import ConfirmForm from "@/components/ConfirmForm";
import LetterAvatar from "@/components/LetterAvatar";
import { PinIcon, TrashIcon } from "@/components/icons";
import { formatDateWithYear } from "@/lib/dates";
import { getT } from "@/lib/i18n";
import { deletePost, togglePostPin } from "@/app/(public)/communities/postActions";
import type { PostViewer } from "./PostComment";
import PostEditForm from "./PostEditForm";

/**
 * Строка списка тем.
 *
 * Раньше карточка показывала тему целиком вместе со всеми
 * комментариями, и вкладка превращалась в одну бесконечную ленту:
 * «если там будет 100500 фоток, то как листать» (жалоба владельца
 * 2026-09-08). Теперь строка — только вывеска разговора (заголовок,
 * автор, дата, сколько ответов), а сам он открывается своей страницей.
 *
 * Закреп, правка и удаление остались тут: это быстрые действия хозяев
 * сообщества и автора, и ради них незачем заходить в каждую тему.
 * Правка появилась здесь по правке владельца 2026-09-09 — «изменить»
 * было только на странице темы, хотя опечатку замечают как раз в
 * списке. Права всё равно перепроверяются в экшенах — скрытая кнопка
 * правом не является.
 */

export type PostListRow = {
  id: string;
  title: string | null;
  /** null — зритель снаружи: текст темы не выбирается из базы вовсе
   *  (см. DiscussionsTab), и отрывка вместо заголовка не будет. */
  text: string | null;
  pinned: boolean;
  /** Нужна форме правки: галочку «только для участников» она показывает
   *  в её текущем состоянии, а не сбрасывает при каждой правке. */
  isPrivate: boolean;
  createdAt: Date;
  author: { id: string; name: string | null; photoUrl: string | null; deletedAt: Date | null };
  commentCount: number;
};

/** Сколько текста показать вместо заголовка. Заголовка может не быть
 *  намеренно (половина тем начинается репликой), а строка списка без
 *  подписи была бы нечитаемой. */
const EXCERPT_MAX = 90;

export default async function PostCard({
  post,
  href,
  viewer,
}: {
  post: PostListRow;
  /** null — зритель снаружи: заголовок виден, но не кликается (правка
   *  владельца 2026-09-09). Ссылка в 404 злит сильнее её отсутствия. */
  href: string | null;
  viewer: PostViewer;
}) {
  const { t, locale } = await getT();
  const s = t.communities.posts;
  const authorName = post.author.deletedAt ? t.common.deletedAccount : post.author.name;
  // Круг лиц у правки и удаления один и тот же: автор, хозяева
  // сообщества, админ сайта (см. postActions.ts). Снаружи (href ===
  // null) действий нет ни у кого: текста темы в строке нет, и автор,
  // успевший выйти из сообщества, правил бы её пустой формой вслепую.
  const canEdit =
    href !== null && (viewer.isAdmin || viewer.canManage || post.author.id === viewer.id);
  // Снаружи текста нет (null) — у темы без заголовка вывеской служит
  // честное «Тема без названия», а не отрывок разговора.
  const excerpt =
    post.text === null
      ? null
      : post.text.length > EXCERPT_MAX
        ? `${post.text.slice(0, EXCERPT_MAX).trimEnd()}…`
        : post.text;
  const heading = post.title ?? excerpt ?? s.untitled;

  return (
    // id — якорь: ссылки из старых уведомлений вели на вкладку с
    // `#post-<id>`, и пусть они хотя бы доводят до нужной строки.
    <article id={`post-${post.id}`} className="surface surface-hover p-3">
      <div className="d-flex align-items-start gap-2">
        <LetterAvatar name={authorName} photoUrl={post.author.photoUrl} size={2.25} />
        <div className="flex-fill" style={{ minWidth: 0 }}>
          <h3 className="h6 mb-1">
            {href ? (
              <AppLink href={href} className="text-white text-decoration-none">
                {heading}
              </AppLink>
            ) : (
              <span className="text-white">{heading}</span>
            )}
          </h3>
          <p className="small text-secondary mb-0">
            {authorName ?? t.reviews.noName} · {formatDateWithYear(post.createdAt, locale)} ·{" "}
            {s.commentsCount(post.commentCount)}
            {post.pinned && (
              <span className="date-chip ms-2 align-middle d-inline-flex align-items-center gap-1">
                <PinIcon /> {s.pinned}
              </span>
            )}
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
          {canEdit && (
            // Иконкой: в ряду действий строки подпись была бы
            // единственным словом среди значков.
            <PostEditForm
              postId={post.id}
              // canEdit гарантирует href !== null, то есть текст выбран;
              // `?? ""` — только для типа.
              initial={{ title: post.title, text: post.text ?? "", isPrivate: post.isPrivate }}
              compact
            />
          )}
          {canEdit && (
            // false — «удаляют из списка»: уводить отсюда некуда,
            // строка просто пропадает (см. deletePost).
            <ConfirmForm
              action={deletePost.bind(null, post.id, false)}
              confirmMessage={s.deletePostConfirm}
            >
              <button type="button" className="icon-btn icon-btn-danger" aria-label={s.deletePost}>
                <TrashIcon />
              </button>
            </ConfirmForm>
          )}
        </div>
      </div>
    </article>
  );
}
