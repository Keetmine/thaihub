import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { dateKey } from "@/lib/dates";
import PerformerForm from "../../PerformerForm";
import MydramalistImport from "../../MydramalistImport";
import { updatePerformer, deletePerformer } from "../../actions";
import ConfirmForm from "@/components/ConfirmForm";

export const dynamic = "force-dynamic";

export default async function EditPerformerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [performer, soloPerformers] = await Promise.all([
    prisma.performer.findUnique({
      where: { id },
      include: {
        links: true,
        dramas: { include: { drama: true }, orderBy: { drama: { title: "asc" } } },
        bandMembers: { select: { performerId: true } },
      },
    }),
    prisma.performer.findMany({
      where: { type: "SOLO", id: { not: id } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!performer) notFound();

  const boundUpdate = updatePerformer.bind(null, id);
  const boundDelete = deletePerformer.bind(null, id);

  return (
    <div>
      <Link href="/admin/performers" className="eyebrow text-decoration-none">
        ← К списку исполнителей
      </Link>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2rem" }}>
        Редактировать исполнителя
      </h1>

      <div className="d-flex flex-column gap-3">
        <PerformerForm
          key={performer.updatedAt.toISOString()}
          action={boundUpdate}
          submitLabel="Сохранить изменения"
          soloPerformers={soloPerformers}
          defaultMemberIds={performer.bandMembers.map((m) => m.performerId)}
          defaultValues={{
            name: performer.name,
            type: performer.type,
            birthDate: performer.birthDate ? dateKey(performer.birthDate) : "",
            bio: performer.bio ?? "",
            agency: performer.agency ?? "",
            photoUrl: performer.photoUrl ?? "",
            mydramalistUrl: performer.mydramalistUrl ?? "",
            links: performer.links.map((l) => ({ label: l.label, url: l.url })),
          }}
        />

        {performer.type === "SOLO" && (
          <>
            <MydramalistImport
              performerId={performer.id}
              defaultUrl={performer.mydramalistUrl ?? ""}
            />

            {performer.dramas.length > 0 && (
              <div className="surface p-4">
                <label className="form-label d-block">Дорамы</label>
                <div className="d-flex flex-wrap gap-2">
                  {performer.dramas.map((pd) => (
                    <span key={pd.dramaId} className="badge text-bg-secondary">
                      {pd.drama.title}
                      {pd.drama.year ? ` (${pd.drama.year})` : ""}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <ConfirmForm
          action={boundDelete}
          confirmMessage={`Удалить исполнителя «${performer.name}»?`}
          className="pt-2"
        >
          <button type="submit" className="btn btn-outline-danger btn-sm">
            Удалить исполнителя
          </button>
        </ConfirmForm>
      </div>
    </div>
  );
}
