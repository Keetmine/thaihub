import Link from "@/components/AppLink";
import { getT } from "@/lib/i18n";
import { formatDateWithYear } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import ConfirmForm from "@/components/ConfirmForm";
import ActionResultForm from "@/components/ActionResultForm";
import CommentLikeButton from "@/components/CommentLikeButton";
import ReportButton from "@/components/ReportButton";
import { TrashIcon, StarIcon, ChatIcon } from "@/components/icons";
import ReviewRatingFields, { type ReviewRatingField } from "@/components/ReviewRatingFields";
import { formatRating } from "@/components/StarRatingInput";
import {
  saveReview,
  deleteReview,
  addComment,
  deleteComment,
  type ReviewKind,
} from "@/app/(public)/reviews/actions";

type CommentWithMeta = {
  id: string;
  text: string;
  createdAt: Date;
  user: { id: string; name: string | null; photoUrl: string | null; deletedAt: Date | null };
  likes: { userId: string }[];
  replies?: CommentWithMeta[];
};

async function CommentRow({
  comment: c,
  currentUser,
  kind,
  targetId,
  canReply,
  replyToId,
}: {
  comment: CommentWithMeta;
  currentUser: { id: string; isAdmin: boolean } | null;
  kind: ReviewKind;
  targetId: string;
  canReply: boolean;
  /** Для ответов на ответы форма цепляется к корню треда. */
  replyToId?: string;
}) {
  const { t, locale } = await getT();
  const boundAdd = addComment.bind(null, kind, targetId);
  // Удалённый аккаунт подписываем на языке зрителя: в базе у него лежит
  // имя, записанное в момент удаления (см. src/lib/userDeletion.ts).
  const authorName = c.user.deletedAt ? t.common.deletedAccount : c.user.name;
  return (
    <div className="d-flex align-items-start gap-2">
      <Avatar name={authorName} photoUrl={c.user.photoUrl} />
      <div className="flex-fill" style={{ minWidth: 0 }}>
        <p className="small mb-1">
          <span className="text-white fw-medium">{authorName ?? t.reviews.noName}</span>
          <span className="text-secondary"> · {formatDateWithYear(c.createdAt, locale)}</span>
        </p>
        <p className="mb-1" style={{ whiteSpace: "pre-wrap" }}>
          {c.text}
        </p>
        <div className="d-flex align-items-center gap-3">
          <CommentLikeButton
            commentId={c.id}
            initialCount={c.likes.length}
            initiallyLiked={!!currentUser && c.likes.some((l) => l.userId === currentUser.id)}
            disabled={!currentUser}
          />
          {(canReply || replyToId) && currentUser && (
            <details>
              <summary
                className="small text-secondary"
                style={{ cursor: "pointer", listStyle: "none" }}
              >
                {t.reviews.reply}
              </summary>
              {/* ActionResultForm: ошибки экшена приходят значением и
                  показываются под формой (см. компонент). */}
              <ActionResultForm action={boundAdd} className="d-flex gap-2 mt-2 flex-wrap">
                <input type="hidden" name="parentId" value={replyToId ?? c.id} />
                <input
                  name="text"
                  required
                  maxLength={3000}
                  placeholder={t.reviews.replyPlaceholder(authorName ?? t.reviews.author)}
                  aria-label={t.reviews.replyAria(authorName ?? t.reviews.author)}
                  className="form-control form-control-sm"
                />
                <button type="submit" className="btn btn-primary btn-sm flex-shrink-0">
                  {t.reviews.send}
                </button>
              </ActionResultForm>
            </details>
          )}
          {currentUser && c.user.id !== currentUser.id && (
            <ReportButton targetType="comment" targetId={c.id} />
          )}
        </div>
      </div>
      {currentUser && (c.user.id === currentUser.id || currentUser.isAdmin) && (
        <ConfirmForm action={deleteComment.bind(null, c.id)} confirmMessage={t.reviews.deleteCommentConfirm}>
          <button
            type="button"
            className="icon-btn icon-btn-danger flex-shrink-0"
            aria-label={t.reviews.deleteComment}
          >
            <TrashIcon />
          </button>
        </ConfirmForm>
      )}
    </div>
  );
}

/** Какие разделы оценки показывать у какого типа записи (правка
 *  владельца 2026-09-07): у новеллы нет актёрской игры, у события —
 *  ни сюжета, ни актёров. Общая оценка есть всегда и здесь не
 *  перечисляется. */
const RATING_FIELDS: Record<ReviewKind, ReviewRatingField[]> = {
  drama: ["story", "acting", "music"],
  novel: ["story"],
  event: ["music"],
};

/** Кинопоиск-стайл цвет оценки: 7+ зелёная, 5–6 серая, ниже — красная. */
function ratingColor(r: number): string {
  if (r >= 7) return "#3bb33b";
  if (r >= 5) return "var(--bs-secondary-color)";
  return "#e5484d";
}

function Avatar({ name, photoUrl }: { name: string | null; photoUrl: string | null }) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        loading="lazy"
        decoding="async"
        src={photoUrl}
        alt=""
        className="rounded-circle flex-shrink-0"
        style={{ width: "2rem", height: "2rem", objectFit: "cover" }}
      />
    );
  }
  return (
    <span
      className="rounded-circle flex-shrink-0 d-inline-flex align-items-center justify-content-center small"
      style={{ width: "2rem", height: "2rem", background: "var(--bs-secondary-bg)", color: "var(--bs-secondary-color)" }}
    >
      {(name ?? "?").charAt(0).toUpperCase()}
    </span>
  );
}

/** Отзывы (оценка 1–10 + текст, один на юзера) и комментарии — общий блок
 *  для сериалов, новелл и событий. Server component: сам делает выборки.
 *  Анониму (открытый каталог) всё видно, формы заменяются CTA «войдите». */
export default async function ReviewsAndComments({
  kind,
  id,
}: {
  kind: ReviewKind;
  id: string;
}) {
  const { t, locale } = await getT();
  const where =
    kind === "drama" ? { dramaId: id } : kind === "novel" ? { novelId: id } : { eventId: id };
  const currentUser = await getCurrentUser();

  const [reviews, comments] = await Promise.all([
    prisma.review.findMany({
      // Приватность фильтруется в where, а не при отрисовке: чужой
      // приватный текст не должен попадать даже в HTML страницы.
      where: {
        ...where,
        OR: [{ isPrivate: false }, ...(currentUser ? [{ userId: currentUser.id }] : [])],
      },
      include: { user: { select: { id: true, name: true, photoUrl: true, deletedAt: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.comment.findMany({
      where: { ...where, parentId: null },
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
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const ownReview = currentUser ? reviews.find((r) => r.user.id === currentUser.id) : undefined;
  // Средний рейтинг и счётчик — только по публичным отзывам: рейтинг —
  // публичный сигнал, невидимая оценка, двигающая среднее, вызывала бы
  // вопросы (то же правило в review.aggregate на страницах записей).
  const publicReviews = reviews.filter((r) => !r.isPrivate);
  const avg = publicReviews.length
    ? Math.round(
        (publicReviews.reduce((sum, r) => sum + r.rating, 0) / publicReviews.length) * 10,
      ) / 10
    : null;

  const boundSaveReview = saveReview.bind(null, kind, id);
  const boundDeleteReview = deleteReview.bind(null, kind, id);
  const boundAddComment = addComment.bind(null, kind, id);

  return (
    <>
      {/* ---------- Отзывы ---------- */}
      <section className="surface p-4 mb-3">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <h2 className="section-heading mb-0 d-flex align-items-center gap-2">
            <StarIcon /> {t.reviews.reviewsHeading}
            {avg !== null && (
              <span className="fw-semibold" style={{ color: ratingColor(avg) }}>
                {avg}
              </span>
            )}
            {publicReviews.length > 0 && (
              <span className="small text-secondary fw-normal">({publicReviews.length})</span>
            )}
          </h2>
        </div>

        {currentUser ? (
          <details className="mb-3">
            <summary className="btn btn-ghost btn-sm d-inline-flex">
              {ownReview ? t.reviews.editReview : t.reviews.writeReview}
            </summary>
            <ActionResultForm action={boundSaveReview} className="d-flex flex-column gap-2 mt-3">
              {/* Оценка по разделам, звёздами с половинками (правка
                  владельца 2026-09-07). Набор разделов зависит от типа
                  записи: у новеллы нет актёров, у события — ни сюжета,
                  ни актёрской игры. */}
              <ReviewRatingFields
                fields={RATING_FIELDS[kind]}
                initial={{
                  overall: ownReview?.rating ?? null,
                  story: ownReview?.ratingStory ?? null,
                  acting: ownReview?.ratingActing ?? null,
                  music: ownReview?.ratingMusic ?? null,
                }}
              />
              <textarea
                name="text"
                rows={4}
                required
                defaultValue={ownReview?.text}
                placeholder={t.reviews.reviewPlaceholder}
                aria-label={t.reviews.reviewAria}
                className="form-control"
              />
              <label className="form-check small text-secondary mb-0">
                <input
                  type="checkbox"
                  name="isPrivate"
                  defaultChecked={ownReview?.isPrivate ?? false}
                  className="form-check-input"
                />{" "}
                {t.reviews.privateLabel}
                <span className="form-text d-block">{t.reviews.privateHint}</span>
              </label>
              <div className="d-flex gap-2">
                <button type="submit" className="btn btn-primary btn-sm">
                  {ownReview ? t.reviews.save : t.reviews.publish}
                </button>
                {ownReview && (
                  <ConfirmForm action={boundDeleteReview} confirmMessage={t.reviews.deleteReviewConfirm}>
                    <button type="button" className="btn btn-outline-secondary btn-sm">
                      {t.reviews.deleteReview}
                    </button>
                  </ConfirmForm>
                )}
              </div>
            </ActionResultForm>
          </details>
        ) : (
          <p className="small text-secondary">
            <Link href="/login" className="link-body-emphasis">
              {t.reviews.signIn}
            </Link>
            {t.reviews.toReview}
          </p>
        )}

        {reviews.length === 0 ? (
          <p className="small text-secondary mb-0">{t.reviews.noReviews}</p>
        ) : (
          <div className="d-flex flex-column gap-3">
            {reviews.map((r) => {
              const authorName = r.user.deletedAt ? t.common.deletedAccount : r.user.name;
              return (
                <div key={r.id} className="d-flex align-items-start gap-2">
                  <Avatar name={authorName} photoUrl={r.user.photoUrl} />
                  <div style={{ minWidth: 0 }}>
                    <p className="small mb-1">
                      <span className="text-white fw-medium">{authorName ?? t.reviews.noName}</span>{" "}
                      <span className="fw-semibold" style={{ color: ratingColor(r.rating) }}>
                        {formatRating(r.rating)}
                      </span>
                      <span className="text-secondary"> · {formatDateWithYear(r.createdAt, locale)}</span>
                      {/* Бейдж только у своего приватного отзыва — чужие
                          в выборку не попадают вовсе. */}
                      {r.isPrivate && (
                        <span
                          className="badge rounded-pill text-bg-secondary ms-2 align-middle"
                          style={{ fontSize: "0.65rem" }}
                        >
                          {t.reviews.privateBadge}
                        </span>
                      )}
                    </p>
                    {/* Разделы — тихой строкой под шапкой отзыва: их
                        заполняют не все, и в главной строке они спорили
                        бы с общей оценкой. */}
                    {(r.ratingStory != null || r.ratingActing != null || r.ratingMusic != null) && (
                      <p className="small text-secondary mb-1">
                        {[
                          r.ratingStory != null
                            ? `${t.reviews.rating.story} ${formatRating(r.ratingStory)}`
                            : null,
                          r.ratingActing != null
                            ? `${t.reviews.rating.acting} ${formatRating(r.ratingActing)}`
                            : null,
                          r.ratingMusic != null
                            ? `${t.reviews.rating.music} ${formatRating(r.ratingMusic)}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                    <p className="mb-1" style={{ whiteSpace: "pre-wrap" }}>
                      {r.text}
                    </p>
                    {currentUser && r.user.id !== currentUser.id && (
                      <ReportButton targetType="review" targetId={r.id} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ---------- Комментарии ---------- */}
      <section className="surface p-4 mb-3">
        <h2 className="section-heading mb-3 d-flex align-items-center gap-2">
          <ChatIcon /> {t.reviews.commentsHeading}
          {comments.length > 0 && (
            <span className="small text-secondary fw-normal">
              ({comments.reduce((sum, c) => sum + 1 + c.replies.length, 0)})
            </span>
          )}
        </h2>

        {currentUser ? (
          <ActionResultForm action={boundAddComment} className="d-flex flex-column gap-2 mb-3">
            <textarea
              name="text"
              rows={2}
              required
              maxLength={3000}
              placeholder={t.reviews.commentPlaceholder}
              aria-label={t.reviews.commentAria}
              className="form-control"
            />
            <button type="submit" className="btn btn-primary btn-sm align-self-start">
              {t.reviews.send}
            </button>
          </ActionResultForm>
        ) : (
          <p className="small text-secondary">
            <Link href="/login" className="link-body-emphasis">
              {t.reviews.signIn}
            </Link>
            {t.reviews.toComment}
          </p>
        )}

        {comments.length === 0 ? (
          <p className="small text-secondary mb-0">
            {t.reviews.noComments}
          </p>
        ) : (
          <div className="d-flex flex-column gap-3">
            {comments.map((c) => (
              <div key={c.id}>
                <CommentRow
                  comment={c}
                  currentUser={currentUser}
                  kind={kind}
                  targetId={id}
                  canReply={!!currentUser}
                />
                {(c.replies?.length ?? 0) > 0 && (
                  <div
                    className="d-flex flex-column gap-2 mt-2 ms-4 ps-3"
                    style={{ borderLeft: "2px solid var(--bs-border-color)" }}
                  >
                    {c.replies!.map((r) => (
                      <CommentRow
                        key={r.id}
                        comment={r}
                        currentUser={currentUser}
                        kind={kind}
                        targetId={id}
                        canReply={false}
                        replyToId={c.id}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
