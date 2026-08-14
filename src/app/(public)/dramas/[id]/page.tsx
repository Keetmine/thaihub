import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import FavoriteButton from "@/components/FavoriteButton";
import WatchStatusSelect from "@/components/WatchStatusSelect";
import EntityMiniCard from "@/components/EntityMiniCard";

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

  const currentUser = await getCurrentUser();
  let isFavorited = false;
  let watchStatus = null as Awaited<
    ReturnType<typeof prisma.dramaWatchStatus.findUnique>
  >;
  if (currentUser) {
    const [favorite, status] = await Promise.all([
      prisma.favoriteDrama.findUnique({
        where: { userId_dramaId: { userId: currentUser.id, dramaId: id } },
      }),
      prisma.dramaWatchStatus.findUnique({
        where: { userId_dramaId: { userId: currentUser.id, dramaId: id } },
      }),
    ]);
    isFavorited = !!favorite;
    watchStatus = status;
  }

  return (
    <div>
      <Link href="/dramas" className="eyebrow text-decoration-none">
        ← Все сериалы
      </Link>
      <div className="d-flex flex-wrap align-items-center gap-3 mt-3 mb-2">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.25rem" }}>
          {drama.title}{" "}
          {drama.year && (
            <span className="fs-5 fw-normal text-secondary">({drama.year})</span>
          )}
        </h1>
        <FavoriteButton kind="drama" id={drama.id} isFavorited={isFavorited} />
      </div>

      <div className="row g-4">
        {(drama.posterUrl || currentUser) && (
          <div className="col-12 col-sm-4 col-md-3">
            {drama.posterUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={drama.posterUrl}
                alt={drama.title}
                className="surface"
                style={{ width: "100%", aspectRatio: "2 / 3", objectFit: "cover" }}
              />
            )}
            {currentUser && (
              <div className="mt-3">
                <span className="small text-secondary d-block mb-1">Статус просмотра</span>
                <WatchStatusSelect dramaId={drama.id} status={watchStatus?.status ?? null} />
              </div>
            )}
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
                <EntityMiniCard
                  key={performer.id}
                  href={`/performers/${performer.id}`}
                  photoUrl={performer.photoUrl}
                  name={performer.name}
                  subtitle={role}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
