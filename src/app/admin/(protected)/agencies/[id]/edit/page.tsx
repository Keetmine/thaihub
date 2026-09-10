import Link from "next/link";
import SavedBanner from "@/components/admin/SavedBanner";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { agencyHref } from "@/lib/slugHelpers";
import AgencyForm from "../../AgencyForm";
import { updateAgency, deleteAgency } from "../../actions";
import ConfirmForm from "@/components/ConfirmForm";
import AuditTrail from "@/components/admin/AuditTrail";
import TranslationEditor from "@/components/admin/TranslationEditor";

export const dynamic = "force-dynamic";

export default async function EditAgencyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;

  // Каталоги в комбобоксы не грузятся (async searchOptions) — только
  // записи, уже привязанные к агентству, чтобы селекты показали выбор.
  const agency = await prisma.agency.findUnique({
    where: { id },
    include: {
      performers: {
        select: { performer: { select: { id: true, name: true, photoUrl: true } } },
      },
      dramas: { select: { id: true, title: true, posterUrl: true } },
      links: { select: { label: true, url: true } },
    },
  });

  if (!agency) notFound();

  const performers = agency.performers.map((p) => p.performer);
  const dramas = agency.dramas;

  const boundUpdate = updateAgency.bind(null, id);
  const boundDelete = deleteAgency.bind(null, id);

  return (
    <div>
      <Link href="/admin/agencies" className="eyebrow text-decoration-none">
        ← К списку агентств
      </Link>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-3 mb-5">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2rem" }}>
          Редактировать агентство
        </h1>
        <a
          href={agencyHref(agency)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-sm"
        >
          Посмотреть на сайте ↗
        </a>
      </div>

      <div className="d-flex flex-column gap-3">
        {saved === "1" && <SavedBanner />}
        <AgencyForm
          key={agency.updatedAt.toISOString()}
          action={boundUpdate}
          submitLabel="Сохранить изменения"
          performers={performers}
          dramas={dramas.map((d) => ({ id: d.id, name: d.title, photoUrl: d.posterUrl }))}
          defaultPerformerIds={performers.map((p) => p.id)}
          defaultDramaIds={agency.dramas.map((d) => d.id)}
          defaultLinks={agency.links}
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
      {/* Перевод на русский — отдельным блоком со своей формой:
          сохранять перевод, проходя валидацию всей карточки, не нужно
          (правка владельца 2026-09-10). */}
      <div className="mt-4">
        <TranslationEditor
          entity="agency"
          id={agency.id}
          original={{
description: agency.description,
          }}
          translations={agency.translations}
        />
      </div>
      <div className="mt-4">
        <AuditTrail entityType="Agency" entityId={agency.id} hideWhenEmpty />
      </div>
    </div>
  );
}
