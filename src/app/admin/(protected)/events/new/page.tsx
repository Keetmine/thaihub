import Link from "next/link";
import { prisma } from "@/lib/prisma";
import EventForm from "../EventForm";
import { createEvent } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  // Каталог исполнителей не грузим — комбобокс формы ищет асинхронно.
  const [pairings, dramas, locations] = await Promise.all([
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

  return (
    <div>
      <Link href="/admin" className="eyebrow text-decoration-none">
        ← К списку событий
      </Link>
      <h1 className="display-1-tight mt-3 mb-5" style={{ fontSize: "2rem" }}>
        Новое событие
      </h1>
      <EventForm
        action={createEvent}
        performers={[]}
        pairings={pairings}
        dramas={dramas.map((d) => ({ id: d.id, name: d.title, photoUrl: d.posterUrl }))}
        locations={locations}
        submitLabel="Создать событие"
      />
    </div>
  );
}
