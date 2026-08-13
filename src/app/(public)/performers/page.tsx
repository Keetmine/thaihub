import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PerformersPage() {
  const performers = await prisma.performer.findMany({
    include: { _count: { select: { events: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <span className="eyebrow">Каталог</span>
      <h1 className="display-1-tight mt-2 mb-4" style={{ fontSize: "2.5rem" }}>
        Исполнители
      </h1>
      {performers.length === 0 ? (
        <p className="text-secondary">Пока нет исполнителей.</p>
      ) : (
        <div className="row g-3">
          {performers.map((p) => (
            <div key={p.id} className="col-6 col-sm-4 col-lg-3">
              <Link
                href={`/performers/${p.id}`}
                className="surface surface-hover text-decoration-none d-block h-100 p-3"
              >
                <p className="font-display fw-medium text-white mb-1">
                  {p.name}
                </p>
                <p className="small text-secondary mb-0">
                  {p.type === "BAND" ? "Группа" : "Соло"} · {p._count.events}{" "}
                  событ.
                </p>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
