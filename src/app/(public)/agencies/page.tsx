import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AgenciesPage() {
  const agencies = await prisma.agency.findMany({
    include: { _count: { select: { performers: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <span className="eyebrow">Каталог</span>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2.5rem" }}>
        Агентства
      </h1>

      {agencies.length === 0 ? (
        <p className="text-secondary">Пока нет агентств.</p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {agencies.map((a) => (
            <Link
              key={a.id}
              href={`/agencies/${a.id}`}
              className="surface surface-hover text-decoration-none d-flex align-items-center gap-3 p-3"
            >
              {a.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.logoUrl}
                  alt=""
                  style={{
                    width: "2.75rem",
                    height: "2.75rem",
                    borderRadius: "50%",
                    objectFit: "cover",
                    flexShrink: 0,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "2.75rem",
                    height: "2.75rem",
                    borderRadius: "50%",
                    background: "var(--bs-secondary-bg)",
                    flexShrink: 0,
                  }}
                />
              )}
              <div>
                <p className="font-display fw-medium text-white mb-0">{a.name}</p>
                <p className="small text-secondary mb-0">
                  {a._count.performers} исполнит.
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
