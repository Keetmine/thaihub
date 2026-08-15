import Link from "next/link";
import { prisma } from "@/lib/prisma";
import PerformerForm from "../PerformerForm";
import { createPerformer } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewPerformerPage() {
  const [soloPerformers, agencies, dramas, events] = await Promise.all([
    prisma.performer.findMany({
      where: { type: "SOLO" },
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
  ]);

  return (
    <div>
      <Link href="/admin/performers" className="eyebrow text-decoration-none">
        ← К списку исполнителей
      </Link>
      <h1 className="display-1-tight mt-3 mb-5" style={{ fontSize: "2rem" }}>
        Новый исполнитель
      </h1>

      <PerformerForm
        action={createPerformer}
        submitLabel="Создать исполнителя"
        soloPerformers={soloPerformers}
        agencies={agencies.map((a) => ({ id: a.id, name: a.name, photoUrl: a.logoUrl }))}
        dramas={dramas.map((d) => ({ id: d.id, name: d.title, photoUrl: d.posterUrl }))}
        events={events.map((e) => ({ id: e.id, name: e.title }))}
      />
    </div>
  );
}
