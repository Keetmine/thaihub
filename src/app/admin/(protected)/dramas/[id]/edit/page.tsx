import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import DramaForm from "../../DramaForm";
import { updateDrama, deleteDrama } from "../../actions";
import ConfirmForm from "@/components/ConfirmForm";

export const dynamic = "force-dynamic";

export default async function EditDramaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [drama, agencies, locations] = await Promise.all([
    prisma.drama.findUnique({
      where: { id },
      include: { performers: { include: { performer: true } }, locations: true },
    }),
    prisma.agency.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, logoUrl: true },
    }),
    prisma.location.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, photoUrl: true },
    }),
  ]);

  if (!drama) notFound();

  const boundUpdate = updateDrama.bind(null, id);
  const boundDelete = deleteDrama.bind(null, id);

  return (
    <div>
      <Link href="/admin/dramas" className="eyebrow text-decoration-none">
        ← К списку сериалов
      </Link>
      <h1 className="display-1-tight mt-3 mb-5" style={{ fontSize: "2rem" }}>
        Редактировать сериал
      </h1>
      <DramaForm
        action={boundUpdate}
        agencies={agencies.map((a) => ({ id: a.id, name: a.name, photoUrl: a.logoUrl }))}
        locations={locations}
        defaultLocationIds={drama.locations.map((dl) => dl.locationId)}
        submitLabel="Сохранить изменения"
        defaultValues={{
          title: drama.title,
          year: drama.year ? String(drama.year) : "",
          posterUrl: drama.posterUrl ?? "",
          synopsis: drama.synopsis ?? "",
          mydramalistUrl: drama.mydramalistUrl ?? "",
          agencyId: drama.agencyId ?? "",
          cast: drama.performers.map((p) => ({
            id: p.performerId,
            name: p.performer.name,
            photoUrl: p.performer.photoUrl,
            role: p.role ?? "",
          })),
        }}
      />

      <ConfirmForm
        action={boundDelete}
        confirmMessage={`Удалить сериал «${drama.title}»?`}
        className="mt-4 pt-4"
      >
        <button type="button" className="btn btn-outline-danger btn-sm">
          Удалить сериал
        </button>
      </ConfirmForm>
    </div>
  );
}
