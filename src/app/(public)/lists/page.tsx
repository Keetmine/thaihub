import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import CreateListButton from "./CreateListButton";
import { VISIBILITY_LABELS } from "@/lib/tripVisibility";
import { listHref } from "@/lib/slugHelpers";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Списки мест",
  description:
    "Подборки мест в Таиланде: кафе и точки съёмок из сериалов, куда хочется дойти. Список можно открыть друзьям и взять с собой в поездку.",
  path: "/lists",
  noIndex: true,
});


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
      <PageHeader eyebrow="Планирование" title="Мои списки мест" size="lg" className="mb-5" />

      <div style={{ maxWidth: "44rem" }}>
        <p className="text-secondary mb-3">
          Собирайте свои подборки локаций — «где вкусная еда», «кафе из
          сериалов», «обязательно к посещению». Список можно показать друзьям
          или всем и прикрепить к поездке.
        </p>
        <div className="mb-4">
          <CreateListButton />
        </div>

        {lists.length === 0 ? (
          <EmptyState
            emoji="📍"
            title="Пока нет ни одного списка"
            hint="Собирайте кафе, места съёмок и магазины в списки — их можно привязать к поездке."
            compact
          />
        ) : (
          <div className="d-flex flex-column gap-2">
            {lists.map((l) => (
              <Link
                key={l.id}
                href={listHref(l)}
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
