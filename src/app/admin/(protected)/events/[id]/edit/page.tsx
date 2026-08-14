import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { dateKey, formatTime } from "@/lib/dates";
import EventForm from "../../EventForm";
import { updateEvent, deleteEvent } from "../../actions";
import ConfirmForm from "@/components/ConfirmForm";

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [event, performers, pairings, dramas, locations] = await Promise.all([
    prisma.event.findUnique({
      where: { id },
      include: {
        performers: true,
        pairings: true,
        occurrences: { orderBy: { startsAt: "asc" } },
      },
    }),
    prisma.performer.findMany({ orderBy: { name: "asc" } }),
    prisma.pairing.findMany({
      include: { performerA: true, performerB: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.drama.findMany({
      orderBy: { title: "asc" },
      select: { id: true, title: true, posterUrl: true },
    }),
    prisma.location.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, photoUrl: true },
    }),
  ]);

  if (!event) notFound();

  const boundUpdate = updateEvent.bind(null, id);
  const boundDelete = deleteEvent.bind(null, id);

  return (
    <div>
      <Link href="/admin" className="eyebrow text-decoration-none">
        ← К списку событий
      </Link>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2rem" }}>
        Редактировать событие
      </h1>
      <EventForm
        action={boundUpdate}
        performers={performers}
        pairings={pairings}
        dramas={dramas.map((d) => ({ id: d.id, name: d.title, photoUrl: d.posterUrl }))}
        locations={locations}
        submitLabel="Сохранить изменения"
        defaultValues={{
          title: event.title,
          venue: event.venue,
          description: event.description ?? "",
          occurrences: event.occurrences.map((o) => ({
            id: o.id,
            date: dateKey(o.startsAt),
            startTime: formatTime(o.startsAt),
            endTime: o.endsAt ? formatTime(o.endsAt) : "",
          })),
          performerIds: event.performers.map((p) => p.performerId),
          pairingIds: event.pairings.map((p) => p.pairingId),
          dramaId: event.dramaId ?? "",
          locationId: event.locationId ?? "",
          presaleDate: event.presaleAt ? dateKey(event.presaleAt) : "",
          presaleTime: event.presaleAt ? formatTime(event.presaleAt) : "",
          presaleUrl: event.presaleUrl ?? "",
          ticketPrice: event.ticketPrice ?? "",
          posterUrl: event.posterUrl ?? "",
        }}
      />

      <ConfirmForm
        action={boundDelete}
        confirmMessage={`Удалить событие «${event.title}»?`}
        className="mt-4 pt-4"
      >
        <button type="button" className="btn btn-outline-danger btn-sm">
          Удалить событие
        </button>
      </ConfirmForm>
    </div>
  );
}
