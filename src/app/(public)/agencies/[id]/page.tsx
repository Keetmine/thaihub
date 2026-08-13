import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AgencyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const agency = await prisma.agency.findUnique({
    where: { id },
    include: { performers: { orderBy: { name: "asc" } } },
  });

  if (!agency) notFound();

  return (
    <div>
      <Link href="/agencies" className="eyebrow text-decoration-none">
        ← Все агентства
      </Link>

      <div className="d-flex flex-wrap align-items-center gap-4 mt-3 mb-4">
        {agency.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={agency.logoUrl}
            alt={agency.name}
            className="rounded-circle flex-shrink-0"
            style={{ width: "6rem", height: "6rem", objectFit: "cover" }}
          />
        ) : (
          <div
            className="rounded-circle flex-shrink-0"
            style={{ width: "6rem", height: "6rem", background: "var(--bs-secondary-bg)" }}
          />
        )}
        <h1 className="display-1-tight mb-0" style={{ fontSize: "2.5rem" }}>
          {agency.name}
        </h1>
      </div>

      {agency.description && (
        <p className="text-secondary mb-4" style={{ maxWidth: "40rem" }}>
          {agency.description}
        </p>
      )}

      <h2 className="small text-secondary text-uppercase mb-2" style={{ letterSpacing: "0.08em" }}>
        Исполнители
      </h2>
      {agency.performers.length === 0 ? (
        <p className="small text-secondary">Пока нет исполнителей.</p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {agency.performers.map((p) => (
            <Link
              key={p.id}
              href={`/performers/${p.id}`}
              className="surface surface-hover text-decoration-none d-flex align-items-center justify-content-between gap-3 p-3"
            >
              <span className="font-display fw-medium text-white">{p.name}</span>
              <span className="small text-secondary flex-shrink-0">
                {p.type === "BAND" ? "Группа" : "Соло"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
