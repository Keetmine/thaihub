import { prisma } from "@/lib/prisma";
import { deleteAgency } from "./actions";
import ConfirmForm from "@/components/ConfirmForm";
import { TrashIcon } from "@/components/icons";
import AgencyFormModal from "./AgencyFormModal";

export const dynamic = "force-dynamic";

export default async function AdminAgenciesPage() {
  const agencies = await prisma.agency.findMany({
    include: { _count: { select: { performers: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <span className="eyebrow">Управление</span>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mt-3 mb-4">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.25rem" }}>
          Агентства
        </h1>
        <AgencyFormModal />
      </div>

      {agencies.length === 0 ? (
        <p className="text-secondary">Пока нет агентств.</p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {agencies.map((a) => {
            const boundDelete = deleteAgency.bind(null, a.id);
            return (
              <div
                key={a.id}
                className="surface d-flex align-items-center justify-content-between gap-3 p-3"
              >
                <div className="d-flex align-items-center gap-3">
                  {a.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.logoUrl}
                      alt=""
                      style={{
                        width: "2.5rem",
                        height: "2.5rem",
                        borderRadius: "50%",
                        objectFit: "cover",
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "2.5rem",
                        height: "2.5rem",
                        borderRadius: "50%",
                        background: "var(--bs-secondary-bg)",
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <div>
                    <p className="font-display fw-medium text-white mb-0">{a.name}</p>
                    <p className="small text-secondary mb-0">
                      {a._count.performers} исполнит.
                    </p>
                  </div>
                </div>
                <div className="d-flex align-items-center gap-2 flex-shrink-0">
                  <AgencyFormModal
                    agency={{
                      id: a.id,
                      name: a.name,
                      logoUrl: a.logoUrl ?? "",
                      description: a.description ?? "",
                    }}
                  />
                  <ConfirmForm
                    action={boundDelete}
                    confirmMessage={`Удалить агентство «${a.name}»?`}
                  >
                    <button
                      type="submit"
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
