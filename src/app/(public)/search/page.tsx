import { prisma } from "@/lib/prisma";
import EventAgendaRow from "@/components/EventAgendaRow";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const query = q.trim().toLocaleLowerCase("ru");

  const events = query
    ? await prisma.event.findMany({
        include: { performers: { include: { performer: true } } },
        orderBy: { startsAt: "asc" },
      })
    : [];

  const results = events.filter(
    (ev) =>
      ev.title.toLocaleLowerCase("ru").includes(query) ||
      ev.venue.toLocaleLowerCase("ru").includes(query) ||
      ev.performers.some((p) =>
        p.performer.name.toLocaleLowerCase("ru").includes(query)
      )
  );

  return (
    <div>
      <span className="eyebrow">Поиск</span>
      <h1 className="display-1-tight mt-2 mb-4" style={{ fontSize: "2.25rem" }}>
        {q ? `«${q}»` : "Поиск событий"}
      </h1>

      {!query ? (
        <p className="text-secondary">
          Введите название события, площадку или исполнителя в поиске сверху.
        </p>
      ) : results.length === 0 ? (
        <p className="text-secondary">Ничего не найдено по запросу «{q}».</p>
      ) : (
        <div className="d-flex flex-column gap-2" style={{ maxWidth: "40rem" }}>
          {results.map((ev) => (
            <EventAgendaRow key={ev.id} event={ev} />
          ))}
        </div>
      )}
    </div>
  );
}
