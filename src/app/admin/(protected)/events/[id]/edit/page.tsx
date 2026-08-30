import Link from "next/link";
import SavedBanner from "@/components/admin/SavedBanner";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { performerOptionLabel } from "@/lib/searchWhere";
import { eventHref } from "@/lib/slugHelpers";
import { dateKey, formatTime } from "@/lib/dates";
import EventForm from "../../EventForm";
import { updateEvent, deleteEvent } from "../../actions";
import ConfirmForm from "@/components/ConfirmForm";
import AuditTrail from "@/components/admin/AuditTrail";

export default async function EditEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;

  // Полный каталог исполнителей в форму больше не грузим (~17 тыс. строк
  // подвешивали селект) — комбобокс ищет асинхронно, а как options нужны
  // только уже привязанные к событию.
  const [event, pairings] = await Promise.all([
    prisma.event.findUnique({
      where: { id },
      include: {
        performers: { include: { performer: true } },
        pairings: true,
        occurrences: {
          orderBy: { startsAt: "asc" },
          include: {
            lineup: {
              include: { performer: { select: { id: true, name: true, realName: true, photoUrl: true } } },
            },
          },
        },
        drama: { select: { id: true, title: true, posterUrl: true } },
        location: { select: { id: true, name: true, photoUrl: true } },
        photos: { orderBy: [{ kind: "asc" }, { sort: "asc" }] },
      },
    }),
    prisma.pairing.findMany({
      include: { performerA: true, performerB: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!event) notFound();

  // Каталоги сериалов/локаций комбобоксы ищут асинхронно — как options
  // достаточно текущего выбора.
  const dramas = event.drama ? [event.drama] : [];
  const locations = event.location ? [event.location] : [];

  const boundUpdate = updateEvent.bind(null, id);
  const boundDelete = deleteEvent.bind(null, id);

  return (
    <div>
      <Link href="/admin/events" className="eyebrow text-decoration-none">
        ← К списку событий
      </Link>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-3 mb-5">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2rem" }}>
          Редактировать событие
        </h1>
        <a
          href={eventHref(event)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-sm"
        >
          Посмотреть на сайте ↗
        </a>
      </div>
      {saved === "1" && <SavedBanner />}
      <EventForm
        action={boundUpdate}
        performers={event.performers.map((p) => ({
          id: p.performer.id,
          name: performerOptionLabel(p.performer),
          photoUrl: p.performer.photoUrl,
        }))}
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
            startTime: o.hasTime ? formatTime(o.startsAt) : "",
            endTime: o.endsAt ? formatTime(o.endsAt) : "",
            lineup: o.lineup.map((l) => ({
              id: l.performer.id,
              name: performerOptionLabel(l.performer),
              photoUrl: l.performer.photoUrl,
            })),
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
          seatingPhotos: event.photos
            .filter((p) => p.kind === "SEATING")
            .map((p) => ({ url: p.url, caption: p.caption ?? "" })),
          benefitPhotos: event.photos
            .filter((p) => p.kind === "BENEFITS")
            .map((p) => ({ url: p.url, caption: p.caption ?? "" })),
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
      <div className="mt-4">
        <AuditTrail entityType="Event" entityId={event.id} hideWhenEmpty />
      </div>
    </div>
  );
}
