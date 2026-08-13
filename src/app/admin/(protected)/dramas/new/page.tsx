import Link from "next/link";
import { prisma } from "@/lib/prisma";
import DramaForm from "../DramaForm";
import { createDrama } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewDramaPage() {
  const performers = await prisma.performer.findMany({
    orderBy: { name: "asc" },
  });

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
        submitLabel="Создать сериал"
      />
    </div>
  );
}
