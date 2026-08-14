import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deleteLocation } from "./actions";
import ConfirmForm from "@/components/ConfirmForm";
import NameSearchBox from "@/components/NameSearchBox";
import { PencilIcon, TrashIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function AdminLocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim();

  const locations = await prisma.location.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
    include: { _count: { select: { dramas: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <span className="eyebrow">Управление</span>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mt-3 mb-4">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.25rem" }}>
          Локации
        </h1>
        <Link href="/admin/locations/new" className="btn btn-primary">
          + Добавить локацию
        </Link>
      </div>

      <NameSearchBox action="/admin/locations" q={q} placeholder="Поиск по названию…" />

      {locations.length === 0 ? (
        <p className="text-secondary">
          {q ? "Ничего не найдено." : "Пока нет локаций."}
        </p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {locations.map((l) => {
            const boundDelete = deleteLocation.bind(null, l.id);
            return (
              <div
                key={l.id}
                className="surface position-relative d-flex align-items-center justify-content-between gap-3 p-3"
              >
                <div className="d-flex align-items-center gap-3">
                  {l.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={l.photoUrl}
                      alt=""
                      style={{
                        width: "2.5rem",
                        height: "2.5rem",
                        borderRadius: "0.5rem",
                        objectFit: "cover",
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "2.5rem",
                        height: "2.5rem",
                        borderRadius: "0.5rem",
                        background: "var(--bs-secondary-bg)",
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <div>
                    <Link
                      href={`/admin/locations/${l.id}/edit`}
                      className="stretched-link text-decoration-none"
                    >
                      <span className="font-display fw-medium text-white d-block">{l.name}</span>
                    </Link>
                    <p className="small text-secondary mb-0">{l._count.dramas} сериал.</p>
                  </div>
                </div>
                <div className="position-relative z-2 d-flex align-items-center gap-2 flex-shrink-0">
                  <Link
                    href={`/admin/locations/${l.id}/edit`}
                    className="icon-btn"
                    aria-label="Редактировать"
                    title="Редактировать"
                  >
                    <PencilIcon />
                  </Link>
                  <ConfirmForm
                    action={boundDelete}
                    confirmMessage={`Удалить локацию «${l.name}»?`}
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
    </div>
  );
}
