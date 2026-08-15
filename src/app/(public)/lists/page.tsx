import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import CreateListButton from "./CreateListButton";
import { VISIBILITY_LABELS } from "@/lib/tripVisibility";

export const dynamic = "force-dynamic";

export default async function ListsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const lists = await prisma.placeList.findMany({
    where: { userId: user.id },
    include: { _count: { select: { items: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <span className="eyebrow">Планирование</span>
      <h1 className="display-1-tight mt-3 mb-5" style={{ fontSize: "2.5rem" }}>
        Мои списки мест
      </h1>

      <div style={{ maxWidth: "44rem" }}>
        <p className="text-secondary mb-3">
          Собирайте свои подборки локаций — «где вкусная еда», «кафе из
          дорам», «обязательно к посещению». Список можно показать друзьям
          или всем и прикрепить к поездке.
        </p>
        <div className="mb-4">
          <CreateListButton />
        </div>

        {lists.length === 0 ? (
          <p className="small text-secondary">Пока нет ни одного списка.</p>
        ) : (
          <div className="d-flex flex-column gap-2">
            {lists.map((l) => (
              <Link
                key={l.id}
                href={`/lists/${l.id}`}
                className="surface surface-hover text-decoration-none d-flex align-items-center justify-content-between gap-3 p-3"
              >
                <div style={{ minWidth: 0 }}>
                  <p className="font-display fw-medium text-white mb-0 text-truncate">{l.title}</p>
                  {l.description && (
                    <p className="small text-secondary mb-0 text-truncate">{l.description}</p>
                  )}
                </div>
                <span className="small text-secondary text-end flex-shrink-0">
                  {l._count.items} мест
                  {l.visibility !== "PRIVATE" && (
                    <span className="d-block" style={{ fontSize: "0.7rem", opacity: 0.7 }}>
                      {VISIBILITY_LABELS[l.visibility]}
                    </span>
                  )}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
