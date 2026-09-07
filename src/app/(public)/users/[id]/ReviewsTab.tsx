"use client";

import AppLink from "@/components/AppLink";
import EmptyState from "@/components/EmptyState";
import { useLocale, useT } from "@/components/LocaleProvider";
import { formatDateWithYear } from "@/lib/dates";
import { formatRating } from "@/components/StarRatingInput";

/** Одна строка вкладки: ссылка/обложка считаются на сервере
 *  (dramaHref/novelHref/eventHref — см. users/[id]/page.tsx), клиенту
 *  приходит уже плоская запись. Зрителю страница передаёт ТОЛЬКО
 *  публичные отзывы — фильтр в серверной выборке, не здесь. */
export type MyReviewRow = {
  id: string;
  rating: number;
  text: string;
  isPrivate: boolean;
  createdAt: Date;
  href: string;
  title: string;
  imageUrl: string | null;
};

/** Тот же кинопоиск-стайл цвет оценки, что в ReviewsAndComments (у того
 *  функция серверная — сюда не импортировать). */
function ratingColor(r: number): string {
  if (r >= 7) return "#3bb33b";
  if (r >= 5) return "var(--bs-secondary-color)";
  return "#e5484d";
}

/**
 * «Мои отзывы» — все отзывы пользователя по сериалам, новеллам и
 * событиям в одном месте, новые сверху. Правки здесь нет намеренно:
 * ссылка ведёт на страницу записи, где форма уже есть, — вкладка
 * остаётся простой.
 */
export default function ReviewsTab({
  reviews,
  viewer = false,
}: {
  reviews: MyReviewRow[];
  /** Чужой профиль: пустое состояние без CTA «напишите отзыв» — призыв
   *  адресован владельцу, а не зрителю. */
  viewer?: boolean;
}) {
  const t = useT();
  const locale = useLocale();

  if (reviews.length === 0) {
    return (
      <EmptyState
        emoji="⭐"
        title={t.account.reviews.emptyTitle}
        hint={viewer ? undefined : t.account.reviews.emptyHint}
        cta={viewer ? undefined : { href: "/dramas", label: t.account.reviews.emptyCta }}
        compact
      />
    );
  }

  return (
    <div className="d-flex flex-column gap-2">
      {reviews.map((r) => (
        <div key={r.id} className="surface d-flex align-items-start gap-3 p-3">
          {r.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              loading="lazy"
              decoding="async"
              src={r.imageUrl}
              alt=""
              className="rounded flex-shrink-0"
              style={{ width: "3rem", height: "4.2rem", objectFit: "cover" }}
            />
          ) : (
            <span
              className="rounded flex-shrink-0 d-inline-flex align-items-center justify-content-center"
              style={{
                width: "3rem",
                height: "4.2rem",
                background: "var(--bs-secondary-bg)",
                color: "var(--bs-secondary-color)",
              }}
              aria-hidden
            >
              ⭐
            </span>
          )}
          <div style={{ minWidth: 0 }}>
            <p className="small mb-1">
              <AppLink href={r.href} className="text-white fw-medium text-decoration-none">
                {r.title}
              </AppLink>{" "}
              <span className="fw-semibold" style={{ color: ratingColor(r.rating) }}>
                {formatRating(r.rating)}
              </span>
              <span className="text-secondary"> · {formatDateWithYear(r.createdAt, locale)}</span>
              {r.isPrivate && (
                <span
                  className="badge rounded-pill text-bg-secondary ms-2 align-middle"
                  style={{ fontSize: "0.65rem" }}
                >
                  {t.reviews.privateBadge}
                </span>
              )}
            </p>
            {/* Первые строки текста, а не весь отзыв: длинный читается на
                странице записи. */}
            <p
              className="small text-secondary mb-0"
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                whiteSpace: "pre-wrap",
              }}
            >
              {r.text}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
