import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { performerOptionLabel } from "@/lib/searchWhere";
import { performerHref } from "@/lib/performerSlug";
import { dateKey } from "@/lib/dates";
import PerformerForm from "../../PerformerForm";
import { updatePerformer, deletePerformer } from "../../actions";
import ConfirmForm from "@/components/ConfirmForm";
import MusicManager from "../../MusicManager";
import AuditTrail from "@/components/admin/AuditTrail";

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
  const [performer, agencies, pairings, allPairings] = await Promise.all([
    prisma.performer.findUnique({
      where: { id },
      include: {
        links: true,
        dramas: { select: { drama: { select: { id: true, title: true, posterUrl: true } } } },
        bandMembers: {
          select: {
            performer: { select: { id: true, name: true, realName: true, photoUrl: true } },
          },
        },
        events: { select: { event: { select: { id: true, title: true } } } },
        albums: { orderBy: [{ year: "desc" }, { title: "asc" }] },
        songs: { orderBy: [{ year: "desc" }, { title: "asc" }] },
        agencies: { select: { agencyId: true } },
        mascotOwners: {
          select: {
            performerId: true,
            pairingId: true,
            performer: { select: { id: true, name: true, realName: true, photoUrl: true } },
          },
        },
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
    // все пейринги — для привязки маскота (список короткий)
    prisma.pairing.findMany({
      include: { performerA: true, performerB: true },
      orderBy: { createdAt: "desc" },
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
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-3 mb-5">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2rem" }}>
          Редактировать исполнителя
        </h1>
        <a
          href={performerHref(performer)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-sm"
        >
          Посмотреть на сайте ↗
        </a>
      </div>

      <div className="d-flex flex-column gap-3">
        <PerformerForm
          key={performer.updatedAt.toISOString()}
          action={boundUpdate}
          submitLabel="Сохранить изменения"
          soloPerformers={performer.bandMembers.map((m) => ({
            id: m.performer.id,
            name: performerOptionLabel(m.performer),
            photoUrl: m.performer.photoUrl,
          }))}
          pairingOptions={allPairings.map((p) => ({
            id: p.id,
            name: p.name || `${p.performerA.name} × ${p.performerB.name}`,
          }))}
          mascotOwnerOptions={performer.mascotOwners
            .filter((o) => o.performer)
            .map((o) => ({
              id: o.performer!.id,
              name: performerOptionLabel(o.performer!),
              photoUrl: o.performer!.photoUrl,
            }))}
          defaultMascotPerformerIds={performer.mascotOwners
            .map((o) => o.performerId)
            .filter((x): x is string => !!x)}
          defaultMascotPairingIds={performer.mascotOwners
            .map((o) => o.pairingId)
            .filter((x): x is string => !!x)}
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
            occupation: performer.occupation.join(", "),
            instruments: performer.instruments.join(", "),
            soloDebut: performer.soloDebut ?? "",
            height: performer.height ?? "",
            weight: performer.weight ?? "",
            mvAppearances: performer.mvAppearances.join("\n"),
            trivia: performer.trivia.join("\n"),
            links: performer.links.map((l) => ({ label: l.label, url: l.url })),
          }}
          extraTabs={[
            {
              key: "music",
              label: `Музыка (${performer.albums.length + performer.songs.length})`,
              content: (
                <MusicManager
                  performerId={performer.id}
                  albums={performer.albums.map((a) => ({
                    id: a.id,
                    title: a.title,
                    type: a.type,
                    year: a.year,
                    coverUrl: a.coverUrl,
                    url: a.url,
                  }))}
                  songs={performer.songs.map((s) => ({
                    id: s.id,
                    title: s.title,
                    note: s.note,
                    year: s.year,
                    url: s.url,
                    albumId: s.albumId,
                  }))}
                />
              ),
            },
            {
              key: "history",
              label: "История",
              content: <AuditTrail entityType="Performer" entityId={performer.id} />,
            },
          ]}
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
