import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AgencyForm from "../../AgencyForm";
import { updateAgency, deleteAgency } from "../../actions";
import ConfirmForm from "@/components/ConfirmForm";

export const dynamic = "force-dynamic";

export default async function EditAgencyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Каталоги в комбобоксы не грузятся (async searchOptions) — только
  // записи, уже привязанные к агентству, чтобы селекты показали выбор.
  const agency = await prisma.agency.findUnique({
    where: { id },
    include: {
      performers: {
        select: { performer: { select: { id: true, name: true, photoUrl: true } } },
      },
      dramas: { select: { id: true, title: true, posterUrl: true } },
    },
  });

  if (!agency) notFound();

  const performers = agency.performers.map((p) => p.performer);
  const dramas = agency.dramas;

  const boundUpdate = updateAgency.bind(null, id);
  const boundDelete = deleteAgency.bind(null, id);

  return (
    <div>
      <Link href="/admin/performers?view=agencies" className="eyebrow text-decoration-none">
        ← К списку агентств
      </Link>
      <h1 className="display-1-tight mt-3 mb-5" style={{ fontSize: "2rem" }}>
        Редактировать агентство
      </h1>

      <div className="d-flex flex-column gap-3">
        <AgencyForm
          key={agency.updatedAt.toISOString()}
          action={boundUpdate}
          submitLabel="Сохранить изменения"
          performers={performers}
          dramas={dramas.map((d) => ({ id: d.id, name: d.title, photoUrl: d.posterUrl }))}
          defaultPerformerIds={performers.map((p) => p.id)}
          defaultDramaIds={agency.dramas.map((d) => d.id)}
          defaultValues={{
            name: agency.name,
            logoUrl: agency.logoUrl ?? "",
            description: agency.description ?? "",
          }}
        />

        <ConfirmForm
          action={boundDelete}
          confirmMessage={`Удалить агентство «${agency.name}»?`}
          className="pt-2"
        >
          <button type="button" className="btn btn-outline-danger btn-sm">
            Удалить агентство
          </button>
        </ConfirmForm>
      </div>
    </div>
  );
}
