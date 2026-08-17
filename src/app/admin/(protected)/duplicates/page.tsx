import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { findDuplicateDramaGroups, findDuplicatePerformerGroups } from "@/lib/duplicates";
import { mergeDramasAction, mergePerformersAction } from "./actions";
import MergeGroupCard from "./MergeGroupCard";
import LetterAvatar from "@/components/LetterAvatar";
import { performerHref } from "@/lib/performerSlug";

export const dynamic = "force-dynamic";

/** Из ссылки на публичную страницу артиста (или голого слага) — слаг. */
function slugFromInput(raw: string): string {
  const t = raw.trim();
  const m = t.match(/\/artists\/([^/?#]+)/);
  return (m ? m[1] : t).trim();
}

async function comparePerformer(slug: string) {
  return prisma.performer.findFirst({
    where: { OR: [{ slug }, { id: slug }] },
    include: {
      _count: { select: { events: true, dramas: true, albums: true, songs: true, favoritedBy: true } },
      agencies: { include: { agency: { select: { name: true } } } },
    },
  });
}

export default async function DuplicatesPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { a: rawA, b: rawB } = await searchParams;
  const [compareA, compareB] =
    rawA && rawB
      ? await Promise.all([comparePerformer(slugFromInput(rawA)), comparePerformer(slugFromInput(rawB))])
      : [null, null];
  const [dramaGroups, performerGroups] = await Promise.all([
    findDuplicateDramaGroups(),
    findDuplicatePerformerGroups(),
  ]);

  const totalGroups = dramaGroups.length + performerGroups.length;

  return (
    <div>
      <Link href="/admin/events" className="eyebrow text-decoration-none">
        ← Админка
      </Link>
      <h1 className="display-1-tight mt-3 mb-3" style={{ fontSize: "2rem" }}>
        Возможные дубли
      </h1>
      <p className="text-secondary mb-4" style={{ maxWidth: "40rem" }}>
        Записи с одинаковым (без учёта регистра) названием; одинаковый ник
        при разных реальных именах и одно название сериала при разных годах
        дублями не считаются. Слияние переносит все связи —
        события, избранное, статусы просмотра, пейринги и т.п. — на выбранную запись и
        удаляет остальные. Действие необратимо.
      </p>

      <div className="surface p-4 mb-4" style={{ maxWidth: "44rem" }}>
        <h2 className="section-heading mb-2">Сравнить и слить вручную</h2>
        <p className="small text-secondary mb-3">
          Вставьте ссылки на две страницы артистов (или слаги) — покажем их
          рядом и дадим слить в одну запись.
        </p>
        <form action="/admin/duplicates" className="d-flex flex-wrap gap-2">
          <input name="a" required defaultValue={rawA ?? ""} placeholder="/artists/… или слаг" className="form-control" style={{ minWidth: "16rem", flex: 1 }} />
          <input name="b" required defaultValue={rawB ?? ""} placeholder="/artists/… или слаг" className="form-control" style={{ minWidth: "16rem", flex: 1 }} />
          <button type="submit" className="btn btn-primary btn-sm flex-shrink-0">Сравнить</button>
        </form>
      </div>

      {rawA && rawB && (
        <div className="mb-4">
          {!compareA || !compareB ? (
            <p className="small text-danger">
              {!compareA && `Не найдено: ${rawA}. `}
              {!compareB && `Не найдено: ${rawB}.`}
            </p>
          ) : compareA.id === compareB.id ? (
            <p className="small text-secondary">Это одна и та же запись.</p>
          ) : (
            <div className="row g-3" style={{ maxWidth: "56rem" }}>
              {[compareA, compareB].map((p, i) => {
                const other = i === 0 ? compareB : compareA;
                return (
                  <div key={p.id} className="col-12 col-md-6">
                    <div className="surface p-3 h-100 d-flex flex-column gap-2">
                      <div className="d-flex align-items-center gap-3">
                        <LetterAvatar name={p.name} photoUrl={p.photoUrl} size={3.5} />
                        <div style={{ minWidth: 0 }}>
                          <a href={performerHref(p)} target="_blank" rel="noopener noreferrer" className="font-display fw-medium text-white d-block text-truncate">
                            {p.name} ↗
                          </a>
                          <span className="small text-secondary">{p.realName ?? "без реального имени"} · {p.type}</span>
                        </div>
                      </div>
                      <p className="small text-secondary mb-0">
                        События: {p._count.events} · Сериалы: {p._count.dramas} · Альбомы: {p._count.albums} · Песни: {p._count.songs} · В избранном: {p._count.favoritedBy}
                      </p>
                      <p className="small text-secondary mb-0">
                        Агентства: {p.agencies.map((a) => a.agency.name).join(", ") || "—"}
                      </p>
                      {p.sourceUrl && <p className="small text-secondary mb-0 text-truncate">Источник: {p.sourceUrl}</p>}
                      <form
                        action={mergePerformersAction.bind(null, p.id, [other.id])}
                        className="mt-auto"
                      >
                        <button type="submit" className="btn btn-primary btn-sm w-100">
                          Оставить эту запись (вторая вольётся)
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
                      sublabel: `${p.realName ? `${p.realName} · ` : ""}${p.type === "BAND" ? "группа" : "соло"}, ${p._count.events} событий, ${p._count.dramas} сериалов`,
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
