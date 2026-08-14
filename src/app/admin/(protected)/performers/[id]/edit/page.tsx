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

  const [performer, soloPerformers, agencies, dramas, events, pairings] = await Promise.all([
    prisma.performer.findUnique({
      where: { id },
      include: {
        links: true,
        dramas: { select: { dramaId: true } },
        bandMembers: { select: { performerId: true } },
        events: { select: { eventId: true } },
      },
    }),
    prisma.performer.findMany({
      where: { type: "SOLO", id: { not: id } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, photoUrl: true },
    }),
    prisma.agency.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, logoUrl: true },
    }),
    prisma.drama.findMany({
      orderBy: { title: "asc" },
      select: { id: true, title: true, posterUrl: true },
    }),
    prisma.event.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true },
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
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2rem" }}>
        Редактировать исполнителя
      </h1>

      <div className="d-flex flex-column gap-3">
        <PerformerForm
          key={performer.updatedAt.toISOString()}
          action={boundUpdate}
          submitLabel="Сохранить изменения"
          soloPerformers={soloPerformers}
          agencies={agencies.map((a) => ({ id: a.id, name: a.name, photoUrl: a.logoUrl }))}
          dramas={dramas.map((d) => ({ id: d.id, name: d.title, photoUrl: d.posterUrl }))}
          events={events.map((e) => ({ id: e.id, name: e.title }))}
          defaultMemberIds={performer.bandMembers.map((m) => m.performerId)}
          defaultDramaIds={performer.dramas.map((pd) => pd.dramaId)}
          defaultEventIds={performer.events.map((pe) => pe.eventId)}
          currentPairings={currentPairings}
          defaultValues={{
            performerId: performer.id,
            name: performer.name,
            type: performer.type,
            realName: performer.realName ?? "",
            birthDate: performer.birthDate ? dateKey(performer.birthDate) : "",
            bio: performer.bio ?? "",
            agencyId: performer.agencyId ?? "",
            photoUrl: performer.photoUrl ?? "",
            mydramalistUrl: performer.mydramalistUrl ?? "",
            links: performer.links.map((l) => ({ label: l.label, url: l.url })),
          }}
        />

        <ConfirmForm
          action={boundDelete}
          confirmMessage={`Удалить исполнителя «${performer.name}»?`}
          className="pt-2"
        >
          <button type="button" className="btn btn-outline-danger btn-sm">
            Удалить исполнителя
          </button>
        </ConfirmForm>
      </div>
    </div>
  );
}
