import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DramaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const drama = await prisma.drama.findUnique({
    where: { id },
    include: { performers: { include: { performer: true } } },
  });

  if (!drama) notFound();

  return (
    <div>
      <Link href="/dramas" className="eyebrow text-decoration-none">
        ← Все сериалы
      </Link>
      <h1 className="display-1-tight mt-2 mb-2" style={{ fontSize: "2.25rem" }}>
        {drama.title}{" "}
        {drama.year && (
          <span className="fs-5 fw-normal text-secondary">({drama.year})</span>
        )}
      </h1>

      <div className="row g-4">
        {drama.posterUrl && (
          <div className="col-12 col-sm-4 col-md-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={drama.posterUrl}
              alt={drama.title}
              className="surface"
              style={{ width: "100%", aspectRatio: "2 / 3", objectFit: "cover" }}
            />
          </div>
        )}

        <div className="col-12 col-sm-8 col-md-9">
          {drama.synopsis && (
            <p className="text-secondary mb-3">{drama.synopsis}</p>
          )}

          {drama.mydramalistUrl && (
            <p className="mb-4">
              <a
                href={drama.mydramalistUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost btn-sm"
              >
                MyDramaList ↗
              </a>
            </p>
          )}

          <h2
            className="small text-secondary text-uppercase mb-2"
            style={{ letterSpacing: "0.08em" }}
          >
            Актёрский состав
          </h2>
          {drama.performers.length === 0 ? (
            <p className="small text-secondary">Состав пока не указан.</p>
          ) : (
            <div className="d-flex flex-wrap gap-2">
              {drama.performers.map(({ performer, role }) => (
                <Link
                  key={performer.id}
                  href={`/performers/${performer.id}`}
                  className="event-chip text-decoration-none"
                >
                  {performer.name}
                  {role ? ` — ${role}` : ""}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
