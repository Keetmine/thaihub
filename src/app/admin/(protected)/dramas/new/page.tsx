import Link from "next/link";
import { prisma } from "@/lib/prisma";
import DramaForm from "../DramaForm";
import { createDrama } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewDramaPage() {
  const [performers, agencies] = await Promise.all([
    prisma.performer.findMany({ orderBy: { name: "asc" } }),
    prisma.agency.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, logoUrl: true },
    }),
  ]);

  return (
    <div>
      <Link href="/admin/dramas" className="eyebrow text-decoration-none">
        ← К списку сериалов
      </Link>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2rem" }}>
        Новый сериал
      </h1>
      <DramaForm
        action={createDrama}
        performers={performers}
        agencies={agencies.map((a) => ({ id: a.id, name: a.name, photoUrl: a.logoUrl }))}
        submitLabel="Создать сериал"
      />
    </div>
  );
}
