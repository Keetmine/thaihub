import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deleteDrama } from "./actions";
import ConfirmForm from "@/components/ConfirmForm";
import NameSearchBox from "@/components/NameSearchBox";
import Pagination from "@/components/Pagination";
import { PencilIcon, TrashIcon } from "@/components/icons";
import TmdbSyncButton from "./TmdbSyncButton";
import { PAGE_SIZE, parsePage, totalPagesFor } from "@/lib/pagination";
import { dramaTitleWhere } from "@/lib/searchWhere";

export const dynamic = "force-dynamic";

export default async function AdminDramasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q: rawQ, page: rawPage } = await searchParams;
  const q = (rawQ ?? "").trim();
  const page = parsePage(rawPage);

  const where = q ? dramaTitleWhere(q) : undefined;
  const [dramas, total] = await Promise.all([
    prisma.drama.findMany({
      where,
      include: { _count: { select: { performers: true } } },
      orderBy: { title: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.drama.count({ where }),
  ]);
  const totalPages = totalPagesFor(total);

  return (
    <div>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-5">
        <div>
          <span className="eyebrow">Управление</span>
          <h1 className="display-1-tight mt-3 mb-0" style={{ fontSize: "2.25rem" }}>
            Сериалы
          </h1>
        </div>
        <Link href="/admin/dramas/new" className="btn btn-primary btn-sm">
          + Добавить сериал
        </Link>
      </div>

      <NameSearchBox action="/admin/dramas" q={q} placeholder="Поиск по названию…" />

      <div className="surface p-3 mb-4">
        <TmdbSyncButton />
      </div>

      {dramas.length === 0 ? (
        <p className="text-secondary">
          {q ? "Ничего не найдено." : "Пока нет сериалов."}
        </p>
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
                    className="icon-btn"
                    aria-label="Редактировать"
                    title="Редактировать"
                  >
                    <PencilIcon />
                  </Link>
                  <ConfirmForm
                    action={boundDelete}
                    confirmMessage={`Удалить сериал «${d.title}»?`}
                  >
                    <button
                      type="button"
                      className="icon-btn icon-btn-danger"
                      aria-label="Удалить"
                      title="Удалить"
                    >
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
        buildHref={(p) => `/admin/dramas?${q ? `q=${encodeURIComponent(q)}&` : ""}page=${p}`}
      />
    </div>
  );
}
