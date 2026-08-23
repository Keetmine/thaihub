import { requireAdminPage } from "@/lib/auth";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import ConfirmForm from "@/components/ConfirmForm";
import SubmitButton from "@/components/admin/SubmitButton";
import Pagination from "@/components/Pagination";
import { TrashIcon } from "@/components/icons";
import { formatShortDate } from "@/lib/dates";
import { PAGE_SIZE, parsePage, totalPagesFor } from "@/lib/pagination";
import { setFeedbackStatus, deleteFeedback } from "./actions";

export const metadata = { title: "Обращения" };

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  QUESTION: "Вопрос",
  SUGGESTION: "Предложение",
  CONTENT_REQUEST: "Запрос контента",
};

// Обращения из формы помощи/поиска (см. FeedbackForm). TODO: дублировать
// новые обращения на почту, когда появятся SMTP-доступы.
export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string; page?: string }>;
}) {
  await requireAdminPage();
  const { all, page: rawPage } = await searchParams;
  const showAll = all === "1";
  const page = parsePage(rawPage);

  const where = showAll ? undefined : { status: "NEW" as const };
  const [items, total, newCount] = await Promise.all([
    prisma.feedback.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.feedback.count({ where }),
    prisma.feedback.count({ where: { status: "NEW" } }),
  ]);
  const totalPages = totalPagesFor(total);

  return (
    <div>
      <span className="eyebrow">Коммьюнити</span>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mt-3 mb-4">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.25rem" }}>
          Обращения
        </h1>
        <span className="small text-secondary">Новых: {newCount}</span>
      </div>

      <div className="tab-bar mb-4">
        <Link href="/admin/feedback" className={`tab-bar-item ${!showAll ? "active" : ""}`}>
          Новые
        </Link>
        <Link href="/admin/feedback?all=1" className={`tab-bar-item ${showAll ? "active" : ""}`}>
          Все
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="text-secondary">Пока пусто.</p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {items.map((f) => {
            const replyEmail = f.email || f.user?.email || null;
            return (
            <div key={f.id} className="surface d-flex flex-wrap justify-content-between gap-3 p-3">
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="small mb-1">
                  <span className="event-chip me-2">{KIND_LABELS[f.kind] ?? f.kind}</span>
                  {f.user ? (
                    <Link href={`/admin/users/${f.user.id}`} className="link-body-emphasis">
                      {f.user.name || f.user.email}
                    </Link>
                  ) : f.email ? (
                    <span className="text-secondary">аноним · {f.email}</span>
                  ) : (
                    <span className="text-secondary">аккаунт удалён</span>
                  )}{" "}
                  <span className="text-secondary">
                    · {formatShortDate(f.createdAt)} {f.createdAt.getFullYear()}
                  </span>
                  {f.status === "DONE" && <span className="text-success"> · обработано</span>}
                </p>
                <p className="mb-0" style={{ whiteSpace: "pre-line" }}>{f.text}</p>
                {f.context && <p className="small text-secondary mb-0 mt-1">{f.context}</p>}
              </div>
              <div className="d-flex align-items-start gap-2 flex-shrink-0">
                {replyEmail && (
                  <a
                    href={`mailto:${replyEmail}?subject=${encodeURIComponent("Ответ на ваше обращение — MyBLHub")}&body=${encodeURIComponent(`\n\n> ${f.text.slice(0, 500)}`)}`}
                    className="btn btn-ghost btn-sm"
                  >
                    Ответить
                  </a>
                )}
                {f.status === "NEW" ? (
                  <form action={setFeedbackStatus.bind(null, f.id, "DONE")}>
                    <SubmitButton label="✓ Обработано" busyLabel="Сохраняем…" className="btn btn-ghost btn-sm" />
                  </form>
                ) : (
                  <form action={setFeedbackStatus.bind(null, f.id, "NEW")}>
                    <SubmitButton label="Вернуть" busyLabel="Возвращаем…" className="btn btn-link btn-sm text-secondary" />
                  </form>
                )}
                <ConfirmForm action={deleteFeedback.bind(null, f.id)} confirmMessage="Удалить обращение?">
                  <button type="button" className="icon-btn icon-btn-danger" aria-label="Удалить">
                    <TrashIcon />
                  </button>
                </ConfirmForm>
              </div>
            </div>
          );
          })}
        </div>
      )}
      <Pagination
        page={page}
        totalPages={totalPages}
        buildHref={(p) => `/admin/feedback?${showAll ? "all=1&" : ""}page=${p}`}
      />
    </div>
  );
}
