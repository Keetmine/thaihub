import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { dateKey } from "@/lib/dates";
import PerformerForm from "../../PerformerForm";
import { updatePerformer, deletePerformer } from "../../actions";
import ConfirmForm from "@/components/ConfirmForm";

export const dynamic = "force-dynamic";

export default async function EditPerformerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Тяжёлые каталоги в комбобоксы не грузятся (searchOptions ищет на
  // сервере) — передаются только уже связанные записи, чтобы селекты
  // могли показать текущий выбор.
  const [performer, agencies, pairings] = await Promise.all([
    prisma.performer.findUnique({
      where: { id },
      include: {
        links: true,
        dramas: { select: { drama: { select: { id: true, title: true, posterUrl: true } } } },
        bandMembers: {
          select: { performer: { select: { id: true, name: true, photoUrl: true } } },
        },
        events: { select: { event: { select: { id: true, title: true } } } },
        agencies: { select: { agencyId: true } },
      },
    }),
    prisma.agency.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, logoUrl: true },
    }),
    prisma.pairing.findMany({
      where: { OR: [{ performerAId: id }, { performerBId: id }] },
      include: { performerA: true, performerB: true },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
  ]);

  if (!performer) notFound();

  const currentPairings = pairings.map((pair) => ({
    id: pair.id,
    label: pair.name || `${pair.performerA.name} × ${pair.performerB.name}`,
    status: pair.status,
  }));

  const boundUpdate = updatePerformer.bind(null, id);
  const boundDelete = deletePerformer.bind(null, id);

  return (
    <div>
      <Link href="/admin/performers" className="eyebrow text-decoration-none">
        ← К списку исполнителей
      </Link>
      <h1 className="display-1-tight mt-3 mb-5" style={{ fontSize: "2rem" }}>
        Редактировать исполнителя
      </h1>

      <div className="d-flex flex-column gap-3">
        <PerformerForm
          key={performer.updatedAt.toISOString()}
          action={boundUpdate}
          submitLabel="Сохранить изменения"
          soloPerformers={performer.bandMembers.map((m) => m.performer)}
          agencies={agencies.map((a) => ({ id: a.id, name: a.name, photoUrl: a.logoUrl }))}
          dramas={performer.dramas.map((pd) => ({
            id: pd.drama.id,
            name: pd.drama.title,
            photoUrl: pd.drama.posterUrl,
          }))}
          events={performer.events.map((pe) => ({ id: pe.event.id, name: pe.event.title }))}
          defaultMemberIds={performer.bandMembers.map((m) => m.performer.id)}
          defaultDramaIds={performer.dramas.map((pd) => pd.drama.id)}
          defaultEventIds={performer.events.map((pe) => pe.event.id)}
          currentPairings={currentPairings}
          defaultValues={{
            performerId: performer.id,
            name: performer.name,
            type: performer.type,
            realName: performer.realName ?? "",
            musicAlias: performer.musicAlias ?? "",
            alsoKnownAs: performer.alsoKnownAs ?? "",
            nationality: performer.nationality ?? "",
            gender: performer.gender ?? "",
            birthDate: performer.birthDate ? dateKey(performer.birthDate) : "",
            placeOfBirth: performer.placeOfBirth ?? "",
            bio: performer.bio ?? "",
            agencyIds: performer.agencies.map((pa) => pa.agencyId),
            photoUrl: performer.photoUrl ?? "",
            mydramalistUrl: performer.mydramalistUrl ?? "",
            links: performer.links.map((l) => ({ label: l.label, url: l.url })),
          }}
        />

        <div className="d-flex flex-wrap align-items-center gap-3 pt-2">
          {performer.type === "SOLO" && (
            <Link href={`/admin/performers/${id}/import-tmdb`} className="btn btn-ghost btn-sm">
              Импортировать с TMDB
            </Link>
          )}
          <ConfirmForm
            action={boundDelete}
            confirmMessage={`Удалить исполнителя «${performer.name}»?`}
          >
            <button type="button" className="btn btn-outline-danger btn-sm">
              Удалить исполнителя
            </button>
          </ConfirmForm>
        </div>
      </div>
    </div>
  );
}
