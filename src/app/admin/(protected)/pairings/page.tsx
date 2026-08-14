import { prisma } from "@/lib/prisma";
import { deletePairing, setPairingStatus } from "./actions";
import ConfirmForm from "@/components/ConfirmForm";
import AdminPerformerTabs from "@/components/AdminPerformerTabs";
import CreatePairingModal from "./CreatePairingModal";
import { TrashIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function AdminPairingsPage() {
  const [pairings, performers] = await Promise.all([
    prisma.pairing.findMany({
      include: {
        performerA: true,
        performerB: true,
        _count: { select: { events: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    // Only solo performers can be paired — bands get members, not pairings.
    prisma.performer.findMany({ where: { type: "SOLO" }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <span className="eyebrow">Управление</span>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mt-3 mb-4">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.25rem" }}>
          Пейринги
        </h1>
        <CreatePairingModal
          performers={performers.map((p) => ({ id: p.id, name: p.name, photoUrl: p.photoUrl }))}
        />
      </div>

      <AdminPerformerTabs active="pairings" />

      {pairings.length === 0 ? (
        <p className="text-secondary">Пока нет пейрингов.</p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {pairings.map((pair) => {
            const boundDelete = deletePairing.bind(null, pair.id);
            const boundToggleStatus = setPairingStatus.bind(
              null,
              pair.id,
              pair.status === "CURRENT" ? "PAST" : "CURRENT",
            );
            const fallbackLabel = `${pair.performerA.name} × ${pair.performerB.name}`;
            return (
              <div
                key={pair.id}
                className="surface d-flex align-items-center justify-content-between gap-3 p-3"
              >
                <div>
                  <p className="font-display fw-medium text-white mb-0 d-flex align-items-center gap-2">
                    {pair.name || fallbackLabel}
                    <span
                      className={`badge rounded-pill ${pair.status === "CURRENT" ? "text-bg-success" : "text-bg-secondary"}`}
                      style={{ fontSize: "0.65rem" }}
                    >
                      {pair.status === "CURRENT" ? "Текущий" : "Бывший"}
                    </span>
                  </p>
                  <p className="small text-secondary mb-0">
                    {pair.name ? fallbackLabel : "Без названия"} · {pair._count.events}{" "}
                    событ.
                  </p>
                </div>
                <div className="d-flex align-items-center gap-2 flex-shrink-0">
                  <form action={boundToggleStatus}>
                    <button type="submit" className="btn btn-ghost btn-sm">
                      {pair.status === "CURRENT" ? "Отметить бывшим" : "Отметить текущим"}
                    </button>
                  </form>
                  <ConfirmForm
                    action={boundDelete}
                    confirmMessage={`Удалить пейринг «${pair.name || fallbackLabel}»?`}
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
