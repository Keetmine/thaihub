import { prisma } from "@/lib/prisma";
import { createPairing, deletePairing } from "./actions";
import ConfirmForm from "@/components/ConfirmForm";

export const dynamic = "force-dynamic";

export default async function AdminPairingsPage() {
  const [pairings, performers] = await Promise.all([
    prisma.pairing.findMany({
      include: {
        performerA: true,
        performerB: true,
        _count: { select: { events: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.performer.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <span className="eyebrow">Управление</span>
      <h1 className="display-1-tight mt-2 mb-4" style={{ fontSize: "2.25rem" }}>
        Пейринги
      </h1>

      <form
        action={createPairing}
        className="surface d-flex flex-wrap align-items-end gap-3 mb-4 p-3"
      >
        <div className="flex-fill" style={{ minWidth: "12rem" }}>
          <label className="form-label">Название пейринга</label>
          <input name="name" className="form-control" placeholder="Необязательно" />
        </div>
        <div>
          <label className="form-label">Исполнитель A *</label>
          <select name="performerAId" required className="form-select">
            <option value="">Выберите…</option>
            {performers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">Исполнитель B *</label>
          <select name="performerBId" required className="form-select">
            <option value="">Выберите…</option>
            {performers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-primary">
          Добавить
        </button>
      </form>

      {pairings.length === 0 ? (
        <p className="text-secondary">Пока нет пейрингов.</p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {pairings.map((pair) => {
            const boundDelete = deletePairing.bind(null, pair.id);
            const fallbackLabel = `${pair.performerA.name} × ${pair.performerB.name}`;
            return (
              <div
                key={pair.id}
                className="surface d-flex align-items-center justify-content-between gap-3 p-3"
              >
                <div>
                  <p className="font-display fw-medium text-white mb-0">
                    {pair.name || fallbackLabel}
                  </p>
                  <p className="small text-secondary mb-0">
                    {pair.name ? fallbackLabel : "Без названия"} · {pair._count.events}{" "}
                    событ.
                  </p>
                </div>
                <ConfirmForm
                  action={boundDelete}
                  confirmMessage={`Удалить пейринг «${pair.name || fallbackLabel}»?`}
                >
                  <button type="submit" className="btn btn-outline-danger btn-sm">
                    Удалить
                  </button>
                </ConfirmForm>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
