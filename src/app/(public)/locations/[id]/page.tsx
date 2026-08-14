import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import VisitedButton from "@/components/VisitedButton";
import LocationMap from "@/components/LocationMapLoader";

export const dynamic = "force-dynamic";

export default async function LocationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const location = await prisma.location.findUnique({
    where: { id },
    include: { dramas: { include: { drama: true }, orderBy: { drama: { title: "asc" } } } },
  });

  if (!location) notFound();

  const currentUser = await getCurrentUser();
  let isVisited = false;
  if (currentUser) {
    const visit = await prisma.locationVisit.findUnique({
      where: { userId_locationId: { userId: currentUser.id, locationId: id } },
    });
    isVisited = !!visit;
  }

  return (
    <div>
      <Link href="/locations" className="eyebrow text-decoration-none">
        ← Все локации
      </Link>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-3 mb-4">
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.5rem" }}>
          {location.name}
        </h1>
        <VisitedButton locationId={location.id} isVisited={isVisited} />
      </div>

      <div className="row g-4">
        {location.photoUrl && (
          <div className="col-12 col-sm-4 col-md-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={location.photoUrl}
              alt={location.name}
              className="surface"
              style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover" }}
            />
          </div>
        )}

        <div className={location.photoUrl ? "col-12 col-sm-8 col-md-9" : "col-12"}>
          {location.description && (
            <p className="text-secondary mb-4">{location.description}</p>
          )}

          <h2
            className="small text-secondary text-uppercase mb-2"
            style={{ letterSpacing: "0.08em" }}
          >
            Сериалы
          </h2>
          {location.dramas.length === 0 ? (
            <p className="small text-secondary">Пока нет связанных сериалов.</p>
          ) : (
            <div className="d-flex flex-wrap gap-2">
              {location.dramas.map(({ drama }) => (
                <Link
                  key={drama.id}
                  href={`/dramas/${drama.id}`}
                  className="surface surface-hover text-decoration-none d-flex align-items-center gap-2 p-2"
                  style={{ width: "11rem" }}
                >
                  <div
                    style={{
                      width: "2.5rem",
                      height: "3.4rem",
                      borderRadius: "0.375rem",
                      background: "var(--bs-secondary-bg)",
                      flexShrink: 0,
                      overflow: "hidden",
                    }}
                  >
                    {drama.posterUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={drama.posterUrl}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    )}
                  </div>
                  <span className="font-display fw-medium text-white text-truncate">
                    {drama.title}
                  </span>
                </Link>
              ))}
            </div>
          )}

          {location.latitude != null && location.longitude != null && (
            <div className="mt-4">
              <h2
                className="small text-secondary text-uppercase mb-2"
                style={{ letterSpacing: "0.08em" }}
              >
                На карте
              </h2>
              <LocationMap
                locations={[
                  {
                    id: location.id,
                    name: location.name,
                    latitude: location.latitude,
                    longitude: location.longitude,
                  },
                ]}
                height="16rem"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
