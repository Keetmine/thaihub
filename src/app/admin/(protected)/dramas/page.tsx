import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deleteDrama } from "./actions";
import ConfirmForm from "@/components/ConfirmForm";

export const dynamic = "force-dynamic";

export default async function AdminDramasPage() {
  const dramas = await prisma.drama.findMany({
    include: { _count: { select: { performers: true } } },
    orderBy: { title: "asc" },
  });

  return (
    <div>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-4">
        <div>
          <span className="eyebrow">Управление</span>
          <h1 className="display-1-tight mt-2 mb-0" style={{ fontSize: "2.25rem" }}>
            Сериалы
          </h1>
        </div>
        <Link href="/admin/dramas/new" className="btn btn-primary btn-sm">
          + Добавить сериал
        </Link>
      </div>

      {dramas.length === 0 ? (
        <p className="text-secondary">Пока нет сериалов.</p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {dramas.map((d) => {
            const boundDelete = deleteDrama.bind(null, d.id);
            return (
              <div
                key={d.id}
                className="surface position-relative d-flex align-items-center justify-content-between gap-3 p-3"
              >
                <div className="d-flex align-items-center gap-3">
                  {d.posterUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={d.posterUrl}
                      alt=""
                      style={{
                        width: "2.75rem",
                        height: "3.75rem",
                        objectFit: "cover",
                        borderRadius: "0.5rem",
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "2.75rem",
                        height: "3.75rem",
                        borderRadius: "0.5rem",
                        background: "var(--bs-secondary-bg)",
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <div>
                    <Link
                      href={`/admin/dramas/${d.id}/edit`}
                      className="stretched-link text-decoration-none"
                    >
                      <span className="font-display fw-medium text-white d-block">
                        {d.title}
                      </span>
                    </Link>
                    <p className="small text-secondary mb-0">
                      {d.year ?? "—"} · {d._count.performers} в актёрском составе
                    </p>
                  </div>
                </div>
                {/* position-relative + z-2 lifts these controls above the
                    row's stretched-link (::after has z-index: 1), so they
                    stay individually clickable instead of triggering the
                    row navigation. */}
                <div className="position-relative z-2 d-flex align-items-center gap-2 flex-shrink-0">
                  <Link
                    href={`/admin/dramas/${d.id}/edit`}
                    className="btn btn-ghost btn-sm"
                    aria-label="Редактировать"
                    title="Редактировать"
                  >
                    ✏️
                  </Link>
                  <ConfirmForm
                    action={boundDelete}
                    confirmMessage={`Удалить сериал «${d.title}»?`}
                  >
                    <button
                      type="submit"
                      className="btn btn-outline-danger btn-sm"
                      aria-label="Удалить"
                      title="Удалить"
                    >
                      🗑️
                    </button>
                  </ConfirmForm>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
