import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createPerformer, deletePerformer } from "./actions";
import ConfirmForm from "@/components/ConfirmForm";

export const dynamic = "force-dynamic";

export default async function AdminPerformersPage() {
  const performers = await prisma.performer.findMany({
    include: { _count: { select: { events: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <span className="eyebrow">Управление</span>
      <h1 className="display-1-tight mt-2 mb-4" style={{ fontSize: "2.25rem" }}>
        Исполнители
      </h1>

      <form
        action={createPerformer}
        className="surface d-flex flex-wrap align-items-end gap-3 mb-4 p-3"
      >
        <div className="flex-fill" style={{ minWidth: "16rem" }}>
          <label className="form-label">Имя / название группы *</label>
          <input name="name" required className="form-control" />
        </div>
        <div>
          <label className="form-label">Тип</label>
          <select name="type" className="form-select">
            <option value="SOLO">Соло</option>
            <option value="BAND">Группа</option>
          </select>
        </div>
        <button type="submit" className="btn btn-primary">
          Добавить
        </button>
      </form>

      {performers.length === 0 ? (
        <p className="text-secondary">Пока нет исполнителей.</p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {performers.map((p) => {
            const boundDelete = deletePerformer.bind(null, p.id);
            return (
              <div
                key={p.id}
                className="surface d-flex align-items-center justify-content-between gap-3 p-3"
              >
                <div>
                  <p className="font-display fw-medium text-white mb-0">{p.name}</p>
                  <p className="small text-secondary mb-0">
                    {p.type === "BAND" ? "Группа" : "Соло"} · {p._count.events}{" "}
                    событ.
                  </p>
                </div>
                <div className="d-flex align-items-center gap-2 flex-shrink-0">
                  <Link
                    href={`/admin/performers/${p.id}/edit`}
                    className="btn btn-outline-secondary btn-sm"
                  >
                    Редактировать
                  </Link>
                  <ConfirmForm
                    action={boundDelete}
                    confirmMessage={`Удалить исполнителя «${p.name}»?`}
                  >
                    <button type="submit" className="btn btn-outline-danger btn-sm">
                      Удалить
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
