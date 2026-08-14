import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import TmdbImportFlow from "./TmdbImportFlow";

export const dynamic = "force-dynamic";

export default async function ImportTmdbPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const performer = await prisma.performer.findUnique({
    where: { id },
    select: { id: true, name: true, tmdbId: true },
  });
  if (!performer) notFound();

  return (
    <div>
      <Link href={`/admin/performers/${id}/edit`} className="eyebrow text-decoration-none">
        ← К исполнителю
      </Link>
      <h1 className="display-1-tight mt-3 mb-2" style={{ fontSize: "2rem" }}>
        Импорт с TMDB — {performer.name}
      </h1>
      <p className="text-secondary mb-4" style={{ maxWidth: "40rem" }}>
        Вставьте ссылку на страницу актёра на themoviedb.org (или сам id) —
        подтянем место рождения и список известных сериалов. Для каждого
        выбранного сериала также импортируется его актёрский состав —
        совпадающие по имени исполнители просто привязываются, остальные
        создаются как новые.
      </p>

      <TmdbImportFlow performerId={performer.id} initialTmdbId={performer.tmdbId} />
    </div>
  );
}
