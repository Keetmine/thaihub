import Link from "next/link";
import { prisma } from "@/lib/prisma";
import EventForm from "../EventForm";
import { createEvent } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  // Каталоги (исполнители/сериалы/локации) не грузим — комбобоксы формы
  // ищут асинхронно (searchOptions).
  const pairings = await prisma.pairing.findMany({
    include: { performerA: true, performerB: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <Link href="/admin/events" className="eyebrow text-decoration-none">
        ← К списку событий
      </Link>
      <h1 className="display-1-tight mt-3 mb-5" style={{ fontSize: "2rem" }}>
        Новое событие
      </h1>
      <EventForm
        action={createEvent}
        performers={[]}
        pairings={pairings}
        dramas={[]}
        locations={[]}
        submitLabel="Создать событие"
      />
    </div>
  );
}
