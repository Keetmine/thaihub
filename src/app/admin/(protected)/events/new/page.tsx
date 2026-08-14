import Link from "next/link";
import { prisma } from "@/lib/prisma";
import EventForm from "../EventForm";
import { createEvent } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  const [performers, pairings, dramas] = await Promise.all([
    prisma.performer.findMany({ orderBy: { name: "asc" } }),
    prisma.pairing.findMany({
      include: { performerA: true, performerB: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.drama.findMany({
      orderBy: { title: "asc" },
      select: { id: true, title: true, posterUrl: true },
    }),
  ]);

  return (
    <div>
      <Link href="/admin" className="eyebrow text-decoration-none">
        ← К списку событий
      </Link>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2rem" }}>
        Новое событие
      </h1>
      <EventForm
        action={createEvent}
        performers={performers}
        pairings={pairings}
        dramas={dramas.map((d) => ({ id: d.id, name: d.title, photoUrl: d.posterUrl }))}
        submitLabel="Создать событие"
      />
    </div>
  );
}
