import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { dramaHref } from "@/lib/dramaSlug";
import DramaForm from "../../DramaForm";
import MdlImportButton from "../../MdlImportButton";
import { updateDrama, deleteDrama } from "../../actions";
import ConfirmForm from "@/components/ConfirmForm";

export const dynamic = "force-dynamic";

export default async function EditDramaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [drama, agencies] = await Promise.all([
    prisma.drama.findUnique({
      where: { id },
      include: {
        performers: { include: { performer: true } },
        locations: { select: { location: { select: { id: true, name: true, photoUrl: true } } } },
        novel: { select: { id: true, title: true, coverUrl: true } },
        agencies: { select: { agencyId: true } },
      },
    }),
    prisma.agency.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, logoUrl: true },
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
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-3 mb-5">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2rem" }}>
          Редактировать сериал
        </h1>
        <a
          href={dramaHref(drama)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-sm"
        >
          Посмотреть на сайте ↗
        </a>
      </div>
      <MdlImportButton dramaId={id} />
      <DramaForm
        action={boundUpdate}
        agencies={agencies.map((a) => ({ id: a.id, name: a.name, photoUrl: a.logoUrl }))}
        locations={drama.locations.map((dl) => dl.location)}
        novels={drama.novel ? [{ id: drama.novel.id, name: drama.novel.title, photoUrl: drama.novel.coverUrl }] : []}
        defaultLocationIds={drama.locations.map((dl) => dl.location.id)}
        submitLabel="Сохранить изменения"
        defaultValues={{
          title: drama.title,
          year: drama.year ? String(drama.year) : "",
          posterUrl: drama.posterUrl ?? "",
          synopsis: drama.synopsis ?? "",
          mydramalistUrl: drama.mydramalistUrl ?? "",
          agencyIds: drama.agencies.map((a) => a.agencyId),
          novelId: drama.novelId ?? "",
          nativeTitle: drama.nativeTitle ?? "",
          alsoKnownAs: drama.alsoKnownAs ?? "",
          director: drama.director ?? "",
          screenwriter: drama.screenwriter ?? "",
          genres: drama.genres.join(", "),
          tags: drama.tags.join(", "),
          episodes: drama.episodes != null ? String(drama.episodes) : "",
          airedOn: drama.airedOn ?? "",
          duration: drama.duration ?? "",
          contentRating: drama.contentRating ?? "",
          network: drama.network ?? "",
          status: drama.status ?? "",
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
