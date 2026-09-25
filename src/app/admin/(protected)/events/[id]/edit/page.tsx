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
import TranslationEditor from "@/components/admin/TranslationEditor";
import EntityTabs from "@/components/admin/EntityTabs";

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
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      performers: { include: { performer: true } },
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
      photos: { orderBy: { sort: "asc" } },
    },
  });

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
      {/* Вкладки «Запись / Перевод / История» — одинаково у всех
          сущностей каталога (правка владельца 2026-09-10). */}
      <EntityTabs
        tabs={[
          {
            key: "record",
            label: "Запись",
            content: (
              <>
          <EventForm
            action={boundUpdate}
            performers={event.performers.map((p) => ({
              id: p.performer.id,
              name: performerOptionLabel(p.performer),
              photoUrl: p.performer.photoUrl,
            }))}
            dramas={dramas.map((d) => ({ id: d.id, name: d.title, photoUrl: d.posterUrl }))}
            locations={locations}
            submitLabel="Сохранить изменения"
            defaultValues={{
              title: event.title,
              venue: event.venue,
              organizer: event.organizer ?? "",
              address: event.address ?? "",
              mapsUrl: event.mapsUrl ?? "",
              tags: event.tags.join(", "),
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
                  timeText: l.timeText ?? "",
                  stage: l.stage ?? "",
                })),
              })),
              performerIds: event.performers.map((p) => p.performerId),
              dramaId: event.dramaId ?? "",
              locationId: event.locationId ?? "",
              presaleDate: event.presaleAt ? dateKey(event.presaleAt) : "",
              presaleTime: event.presaleAt ? formatTime(event.presaleAt) : "",
              presaleUrl: event.presaleUrl ?? "",
              ticketPrice: event.ticketPrice ?? "",
              posterUrl: event.posterUrl ?? "",
              photos: event.photos.map((p) => ({ url: p.url })),
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
              </>
            ),
          },
          {
            key: "translation",
            label: "Перевод",
            content: (
              <TranslationEditor
                entity="event"
                id={event.id}
                original={{
                  title: event.title,
                  description: event.description,
                  venue: event.venue,
                }}
                translations={event.translations}
              />
            ),
          },
          {
            key: "history",
            label: "История",
            content: <AuditTrail entityType="Event" entityId={event.id} />,
          },
        ]}
      />
    </div>
  );
}
