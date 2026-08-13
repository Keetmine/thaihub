import Link from "next/link";
import { prisma } from "@/lib/prisma";
import EventForm from "../EventForm";
import { createEvent } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  const performers = await prisma.performer.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <Link href="/admin" className="eyebrow text-decoration-none">
        ← К списку событий
      </Link>
      <h1 className="display-1-tight mt-2 mb-4" style={{ fontSize: "2rem" }}>
        Новое событие
      </h1>
      <EventForm
        action={createEvent}
        performers={performers}
        submitLabel="Создать событие"
      />
    </div>
  );
}
