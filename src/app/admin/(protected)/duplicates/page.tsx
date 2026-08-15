import Link from "next/link";
import { findDuplicateDramaGroups, findDuplicatePerformerGroups } from "@/lib/duplicates";
import { mergeDramasAction, mergePerformersAction } from "./actions";
import MergeGroupCard from "./MergeGroupCard";

export const dynamic = "force-dynamic";

export default async function DuplicatesPage() {
  const [dramaGroups, performerGroups] = await Promise.all([
    findDuplicateDramaGroups(),
    findDuplicatePerformerGroups(),
  ]);

  const totalGroups = dramaGroups.length + performerGroups.length;

  return (
    <div>
      <Link href="/admin" className="eyebrow text-decoration-none">
        ← Админка
      </Link>
      <h1 className="display-1-tight mt-3 mb-3" style={{ fontSize: "2rem" }}>
        Возможные дубли
      </h1>
      <p className="text-secondary mb-4" style={{ maxWidth: "40rem" }}>
        Записи с одинаковым (без учёта регистра) названием. Слияние переносит все связи —
        события, избранное, статусы просмотра, пейринги и т.п. — на выбранную запись и
        удаляет остальные. Действие необратимо.
      </p>

      {totalGroups === 0 ? (
        <p className="text-secondary">Дублей не найдено.</p>
      ) : (
        <div className="d-flex flex-column gap-4">
          {dramaGroups.length > 0 && (
            <div>
              <h2
                className="section-heading mb-2"
              >
                Сериалы ({dramaGroups.length})
              </h2>
              <div className="d-flex flex-column gap-2">
                {dramaGroups.map((group) => (
                  <MergeGroupCard
                    key={group.key}
                    title={group.rows[0].title}
                    editHrefBase="/admin/dramas"
                    rows={group.rows.map((d) => ({
                      id: d.id,
                      label: `${d.title}${d.year ? ` (${d.year})` : ""}`,
                      sublabel: `${d._count.performers} исполнителей, ${d._count.locations} локаций, ${d._count.events} событий`,
                    }))}
                    onMerge={mergeDramasAction}
                  />
                ))}
              </div>
            </div>
          )}

          {performerGroups.length > 0 && (
            <div>
              <h2
                className="section-heading mb-2"
              >
                Исполнители ({performerGroups.length})
              </h2>
              <div className="d-flex flex-column gap-2">
                {performerGroups.map((group) => (
                  <MergeGroupCard
                    key={group.key}
                    title={group.rows[0].name}
                    editHrefBase="/admin/performers"
                    rows={group.rows.map((p) => ({
                      id: p.id,
                      label: p.name,
                      sublabel: `${p.type === "BAND" ? "группа" : "соло"}, ${p._count.events} событий, ${p._count.dramas} сериалов`,
                    }))}
                    onMerge={mergePerformersAction}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
