import AppLink from "@/components/AppLink";
import EmptyState from "@/components/EmptyState";
import { formatDateWithYear } from "@/lib/dates";
import type { Dict, Locale } from "@/lib/i18n";

/** Одна строка вкладки «Комментарии»: ссылка/обложка посчитаны на
 *  сервере (dramaHref/novelHref/eventHref в page.tsx), сюда приходит
 *  плоская запись. Ссылка ведёт на страницу записи — там и живёт тред
 *  комментариев (своего адреса у комментария нет). */
export type MyCommentRow = {
  id: string;
  text: string;
  createdAt: Date;
  href: string;
  title: string;
  imageUrl: string | null;
};

/**
 * «Комментарии» — комментарии пользователя по сериалам, новеллам и
 * событиям, новые сверху (правка владельца п.9). Комментарии публичны,
 * поэтому зритель видит те же строки; гейт один — мастер-выключатель
 * hideProfileActivity, при нём зрителю не отдаётся ни одна вкладка
 * (решается в page.tsx, не здесь).
 */
export default function CommentsTab({
  comments,
  t,
  locale,
  isSelf,
  ownerName,
}: {
  comments: MyCommentRow[];
  t: Dict;
  locale: Locale;
  isSelf: boolean;
  ownerName: string;
}) {
  const c = t.social.profile.commentsTab;

  if (comments.length === 0) {
    return (
      <EmptyState
        emoji="💬"
        title={c.emptyTitle}
        hint={isSelf ? c.emptyHintSelf : c.emptyHintViewer(ownerName)}
        cta={isSelf ? { href: "/dramas", label: t.social.profile.dramasTab.emptyCta } : undefined}
        compact
      />
    );
  }

  return (
    <div className="d-flex flex-column gap-2">
      {comments.map((row) => (
        <div key={row.id} className="surface d-flex align-items-start gap-3 p-3">
          {row.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              loading="lazy"
              decoding="async"
              src={row.imageUrl}
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
              💬
            </span>
          )}
          <div style={{ minWidth: 0 }}>
            <p className="small mb-1">
              <AppLink href={row.href} className="text-white fw-medium text-decoration-none">
                {row.title}
              </AppLink>
              <span className="text-secondary"> · {formatDateWithYear(row.createdAt, locale)}</span>
            </p>
            {/* Первые строки, а не весь комментарий: тред читается на
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
              {row.text}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
