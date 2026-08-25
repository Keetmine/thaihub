"use client";

import { useState } from "react";
import { toggleCommentLike } from "@/app/(public)/reviews/actions";
import { HeartIcon } from "@/components/icons";
import { useT } from "@/components/LocaleProvider";

/** Лайк комментария: оптимистичный тоггл, число рядом с сердечком. */
export default function CommentLikeButton({
  commentId,
  initialCount,
  initiallyLiked,
  disabled = false,
}: {
  commentId: string;
  initialCount: number;
  initiallyLiked: boolean;
  /** Аноним: показываем счётчик без интерактива. */
  disabled?: boolean;
}) {
  const t = useT();
  const [liked, setLiked] = useState(initiallyLiked);
  const [count, setCount] = useState(initialCount);
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (pending || disabled) return;
    setPending(true);
    setLiked((v) => !v);
    setCount((c) => c + (liked ? -1 : 1));
    try {
      const result = await toggleCommentLike(commentId);
      setLiked(result.liked);
      setCount(result.count);
    } catch {
      setLiked(liked);
      setCount(count);
    } finally {
      setPending(false);
    }
  }

  if (disabled && count === 0) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled || pending}
      className={`btn btn-link btn-sm p-0 d-inline-flex align-items-center gap-1 text-decoration-none ${
        liked ? "text-danger" : "text-secondary"
      }`}
      aria-pressed={liked}
      aria-label={liked ? t.widgets.commentLike.unlike : t.widgets.commentLike.like}
      style={{ fontSize: "0.8rem" }}
    >
      <HeartIcon filled={liked} />
      {count > 0 && count}
    </button>
  );
}
