import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AgencyForm from "../AgencyForm";
import { createAgency } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewAgencyPage() {
  const [performers, dramas] = await Promise.all([
    prisma.performer.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, photoUrl: true },
    }),
    prisma.drama.findMany({
      orderBy: { title: "asc" },
      select: { id: true, title: true, posterUrl: true },
    }),
  ]);

  return (
    <div>
      <Link href="/admin/performers?view=agencies" className="eyebrow text-decoration-none">
        ← К списку агентств
      </Link>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2rem" }}>
        Новое агентство
      </h1>
      <AgencyForm
        action={createAgency}
        submitLabel="Создать агентство"
        performers={performers}
        dramas={dramas.map((d) => ({ id: d.id, name: d.title, photoUrl: d.posterUrl }))}
      />
    </div>
  );
}
