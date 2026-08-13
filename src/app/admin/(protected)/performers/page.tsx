import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deletePerformer } from "./actions";
import ConfirmForm from "@/components/ConfirmForm";
import AdminPerformerTabs from "@/components/AdminPerformerTabs";
import { PencilIcon, TrashIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function AdminPerformersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const isBands = view === "bands";

  const performers = await prisma.performer.findMany({
    where: { type: isBands ? "BAND" : "SOLO" },
    include: { _count: { select: { events: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <span className="eyebrow">Управление</span>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mt-3 mb-4">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.25rem" }}>
          {isBands ? "Группы" : "Актёры"}
        </h1>
        <Link href="/admin/performers/new" className="btn btn-primary">
          + Добавить исполнителя
        </Link>
      </div>

      <AdminPerformerTabs active={isBands ? "bands" : "performers"} />

      {performers.length === 0 ? (
        <p className="text-secondary">
          {isBands ? "Пока нет групп." : "Пока нет актёров."}
        </p>
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
                  <p className="small text-secondary mb-0">{p._count.events} событ.</p>
                </div>
                <div className="d-flex align-items-center gap-2 flex-shrink-0">
                  <Link
                    href={`/admin/performers/${p.id}/edit`}
                    className="icon-btn"
                    aria-label="Редактировать"
                    title="Редактировать"
                  >
                    <PencilIcon />
                  </Link>
                  <ConfirmForm
                    action={boundDelete}
                    confirmMessage={`Удалить исполнителя «${p.name}»?`}
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
