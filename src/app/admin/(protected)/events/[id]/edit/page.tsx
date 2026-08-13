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

  const [event, performers] = await Promise.all([
    prisma.event.findUnique({
      where: { id },
      include: { performers: true },
    }),
    prisma.performer.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!event) notFound();

  const boundUpdate = updateEvent.bind(null, id);
  const boundDelete = deleteEvent.bind(null, id);

  return (
    <div>
      <Link href="/admin" className="eyebrow text-decoration-none">
        ← К списку событий
      </Link>
      <h1 className="display-1-tight mt-2 mb-4" style={{ fontSize: "2rem" }}>
        Редактировать событие
      </h1>
      <EventForm
        action={boundUpdate}
        performers={performers}
        submitLabel="Сохранить изменения"
        defaultValues={{
          title: event.title,
          venue: event.venue,
          description: event.description ?? "",
          date: dateKey(event.startsAt),
          startTime: formatTime(event.startsAt),
          endTime: event.endsAt ? formatTime(event.endsAt) : "",
          performerIds: event.performers.map((p) => p.performerId),
          presaleDate: event.presaleAt ? dateKey(event.presaleAt) : "",
          presaleTime: event.presaleAt ? formatTime(event.presaleAt) : "",
          presaleUrl: event.presaleUrl ?? "",
        }}
      />

      <ConfirmForm
        action={boundDelete}
        confirmMessage={`Удалить событие «${event.title}»?`}
        className="mt-4 pt-4"
      >
        <button type="submit" className="btn btn-outline-danger btn-sm">
          Удалить событие
        </button>
      </ConfirmForm>
    </div>
  );
}
