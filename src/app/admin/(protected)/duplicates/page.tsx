import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  findDuplicateAgencyGroups,
  findDuplicateDramaGroups,
  findDuplicatePerformerGroups,
  groupMemberKey,
} from "@/lib/duplicates";
import {
  mergeAgenciesAction,
  mergeDramasAction,
  mergePerformersAction,
  dismissDuplicateGroupAction,
  restoreDuplicateGroupAction,
} from "./actions";
import MergeGroupCard from "./MergeGroupCard";
import SubmitButton from "@/components/admin/SubmitButton";
import Pagination from "@/components/Pagination";
import LetterAvatar from "@/components/LetterAvatar";
import { DENSE_PAGE_SIZE, parsePage, totalPagesFor } from "@/lib/pagination";
import { performerHref } from "@/lib/performerSlug";

export const metadata = { title: "Дубли" };

export const dynamic = "force-dynamic";

/** Из ссылки на публичную страницу (артист или сериал) — тип и слаг. */
function parseCompareInput(raw: string): { kind: "performer" | "drama" | "any"; slug: string } {
  const t = raw.trim();
  const artist = t.match(/\/artists\/([^/?#]+)/);
  if (artist) return { kind: "performer", slug: artist[1] };
  const drama = t.match(/\/dramas\/([^/?#]+)/);
  if (drama) return { kind: "drama", slug: drama[1] };
  return { kind: "any", slug: t };
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

async function compareDrama(slug: string) {
  return prisma.drama.findFirst({
    where: { OR: [{ slug }, { id: slug }] },
    include: {
      _count: { select: { performers: true, locations: true, events: true, watchStatuses: true } },
    },
  });
}

export default async function DuplicatesPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string; page?: string; hidden?: string }>;
}) {
  const { a: rawA, b: rawB, page: rawPage, hidden: rawHidden } = await searchParams;
  const showHidden = rawHidden === "1";
  const inputA = rawA ? parseCompareInput(rawA) : null;
  const inputB = rawB ? parseCompareInput(rawB) : null;
  // Сериалы, если хотя бы одна ссылка /dramas/ — иначе артисты.
  const compareKind =
    inputA?.kind === "drama" || inputB?.kind === "drama" ? "drama" : "performer";
  const [compareA, compareB] =
    inputA && inputB && compareKind === "performer"
      ? await Promise.all([comparePerformer(inputA.slug), comparePerformer(inputB.slug)])
      : [null, null];
  const [dramaA, dramaB] =
    inputA && inputB && compareKind === "drama"
      ? await Promise.all([compareDrama(inputA.slug), compareDrama(inputB.slug)])
      : [null, null];
  const [allDramaGroups, allPerformerGroups, allAgencyGroups, dismissals] = await Promise.all([
    findDuplicateDramaGroups(),
    findDuplicatePerformerGroups(),
    findDuplicateAgencyGroups(),
    prisma.duplicateDismissal.findMany({ select: { entityType: true, memberKey: true } }),
  ]);
  // И5: «не сливать» — скрытые группы уходят из основного списка, но
  // остаются достижимы (?hidden=1): скрытие по ошибке иначе было бы
  // необратимо-невидимым. Ключ — точный состав группы, поэтому со
  // сменой состава (нашёлся третий кандидат) группа возвращается сама.
  const dismissed = new Set(dismissals.map((d) => `${d.entityType}::${d.memberKey}`));
  const isDismissed = (entityType: string, rows: { id: string }[]) =>
    dismissed.has(`${entityType}::${groupMemberKey(rows)}`);
  const dramaGroups = allDramaGroups.filter(
    (g) => isDismissed("drama", g.rows) === showHidden,
  );
  const performerGroups = allPerformerGroups.filter(
    (g) => isDismissed("performer", g.rows) === showHidden,
  );
  const agencyGroups = allAgencyGroups.filter(
    (g) => isDismissed("agency", g.rows) === showHidden,
  );
  const hiddenCount =
    allDramaGroups.filter((g) => isDismissed("drama", g.rows)).length +
    allPerformerGroups.filter((g) => isDismissed("performer", g.rows)).length +
    allAgencyGroups.filter((g) => isDismissed("agency", g.rows)).length;

  // Групп бывает несколько сотен, и каждая — карточка с формой слияния:
  // страница отдавала их разом и заметно тормозила. Режем общий список
  // (сериалы, потом исполнители) на страницы DENSE_PAGE_SIZE — заголовок
  // раздела показывает полное число групп, под ним только те, что попали
  // на текущую страницу.
  const totalGroups = dramaGroups.length + performerGroups.length + agencyGroups.length;
  const page = parsePage(rawPage);
  const totalPages = totalPagesFor(totalGroups, DENSE_PAGE_SIZE);
  const from = (page - 1) * DENSE_PAGE_SIZE;
  // Разделы идут встык одним сквозным списком: `before` — сколько групп
  // стоит перед этим разделом, чтобы окно страницы попало в него куском.
  const sliceSection = <T,>(groups: T[], before: number) =>
    groups.slice(Math.max(0, from - before), Math.max(0, from + DENSE_PAGE_SIZE - before));
  const pageDramaGroups = sliceSection(dramaGroups, 0);
  const pagePerformerGroups = sliceSection(performerGroups, dramaGroups.length);
  const pageAgencyGroups = sliceSection(
    agencyGroups,
    dramaGroups.length + performerGroups.length,
  );
  const compareParams =
    (rawA ? `a=${encodeURIComponent(rawA)}&` : "") +
    (rawB ? `b=${encodeURIComponent(rawB)}&` : "");

  return (
    <div>
      <Link href="/admin/events" className="eyebrow text-decoration-none">
        ← Админка
      </Link>
      <h1 className="display-1-tight mt-3 mb-3" style={{ fontSize: "2rem" }}>
        {showHidden ? "Скрытые из дублей" : "Возможные дубли"}
      </h1>
      {showHidden ? (
        <p className="text-secondary mb-4" style={{ maxWidth: "40rem" }}>
          Группы, помеченные «не сливать» (ремейки, тёзки). «Вернуть в
          дубли» — и группа снова появится в общем списке.{" "}
          <Link href="/admin/duplicates">← К дублям</Link>
        </p>
      ) : (
        hiddenCount > 0 && (
          <p className="small text-secondary mb-3">
            <Link href="/admin/duplicates?hidden=1">Скрытые «не сливать» ({hiddenCount})</Link>
          </p>
        )
      )}
      <p className="text-secondary mb-4" style={{ maxWidth: "40rem" }}>
        Сериалы, исполнители и агентства с одинаковым (без учёта регистра)
        названием. У исполнителей — сольные и группы вместе, одним списком:
        «группа X» и заведённый парсером «соло X» это и есть дубль. Ловятся
        и написания, разошедшиеся пробелом, дефисом или апострофом
        («Yes&#39;sirdays» и «Yes&#39;sir Days», «Lee Tae-vin» и «Lee Tae
        Vin»). Одинаковый ник при разных реальных именах и одно название
        сериала при разных годах дублями не считаются. Слияние переносит все связи —
        события, избранное, статусы просмотра, пейринги и т.п. — на выбранную запись и
        удаляет остальные. Действие необратимо.
      </p>

      <div className="surface p-4 mb-4" style={{ maxWidth: "44rem" }}>
        <h2 className="section-heading mb-2">Сравнить и слить вручную</h2>
        <p className="small text-secondary mb-3">
          Вставьте ссылки на две страницы артистов или сериалов (или слаги)
          — покажем их рядом и дадим слить в одну запись.
        </p>
        <form action="/admin/duplicates" className="d-flex flex-wrap gap-2">
          <input name="a" required defaultValue={rawA ?? ""} placeholder="/artists/… или слаг" aria-label="Первая запись" className="form-control" style={{ minWidth: "16rem", flex: 1 }} />
          <input name="b" required defaultValue={rawB ?? ""} placeholder="/artists/… или слаг" aria-label="Вторая запись" className="form-control" style={{ minWidth: "16rem", flex: 1 }} />
          <button type="submit" className="btn btn-primary btn-sm flex-shrink-0">Сравнить</button>
        </form>
      </div>

      {rawA && rawB && compareKind === "drama" && (
        <div className="mb-4">
          {!dramaA || !dramaB ? (
            <p className="small text-danger">
              {!dramaA && `Не найдено: ${rawA}. `}
              {!dramaB && `Не найдено: ${rawB}.`}
            </p>
          ) : dramaA.id === dramaB.id ? (
            <p className="small text-secondary">Это одна и та же запись.</p>
          ) : (
            <div className="row g-3" style={{ maxWidth: "56rem" }}>
              {[dramaA, dramaB].map((d, i) => {
                const other = i === 0 ? dramaB : dramaA;
                return (
                  <div key={d.id} className="col-12 col-md-6">
                    <div className="surface p-3 h-100 d-flex flex-column gap-2">
                      <div className="d-flex align-items-center gap-3">
                        <LetterAvatar name={d.title} photoUrl={d.posterUrl} size={2.75} height={3.75} rounded={false} />
                        <div style={{ minWidth: 0 }}>
                          <a href={`/dramas/${d.slug ?? d.id}`} target="_blank" rel="noopener noreferrer" className="font-display fw-medium text-white d-block text-truncate">
                            {d.title} ↗
                          </a>
                          <span className="small text-secondary">{d.year ?? "год не указан"}</span>
                        </div>
                      </div>
                      <p className="small text-secondary mb-0">
                        Каст: {d._count.performers} · Локации: {d._count.locations} · События: {d._count.events} · Статусы: {d._count.watchStatuses}
                      </p>
                      {d.mydramalistUrl && <p className="small text-secondary mb-0 text-truncate">MDL: {d.mydramalistUrl}</p>}
                      <form action={mergeDramasAction.bind(null, d.id, [other.id])} className="mt-auto">
                        <SubmitButton
                          label="Оставить эту запись (вторая вольётся)"
                          busyLabel="Слияние…"
                          className="btn btn-primary btn-sm w-100"
                        />
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {rawA && rawB && compareKind === "performer" && (
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
                        <SubmitButton
                          label="Оставить эту запись (вторая вольётся)"
                          busyLabel="Слияние…"
                          className="btn btn-primary btn-sm w-100"
                        />
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
        <p className="text-secondary">{showHidden ? "Скрытых групп нет." : "Дублей не найдено."}</p>
      ) : (
        <div className="d-flex flex-column gap-4">
          {pageDramaGroups.length > 0 && (
            <div>
              <h2
                className="section-heading mb-2"
              >
                Сериалы ({dramaGroups.length})
              </h2>
              <div className="d-flex flex-column gap-2">
                {pageDramaGroups.map((group) => (
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
                    dismissLabel={showHidden ? "Вернуть в дубли" : "Не сливать"}
                    onDismiss={(showHidden ? restoreDuplicateGroupAction : dismissDuplicateGroupAction).bind(
                      null,
                      "drama",
                      groupMemberKey(group.rows),
                    )}
                  />
                ))}
              </div>
            </div>
          )}

          {pagePerformerGroups.length > 0 && (
            <div>
              <h2
                className="section-heading mb-2"
              >
                Исполнители ({performerGroups.length})
              </h2>
              <div className="d-flex flex-column gap-2">
                {pagePerformerGroups.map((group) => (
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
                    dismissLabel={showHidden ? "Вернуть в дубли" : "Не сливать"}
                    onDismiss={(showHidden ? restoreDuplicateGroupAction : dismissDuplicateGroupAction).bind(
                      null,
                      "performer",
                      groupMemberKey(group.rows),
                    )}
                  />
                ))}
              </div>
            </div>
          )}

          {pageAgencyGroups.length > 0 && (
            <div>
              <h2 className="section-heading mb-2">Агентства ({agencyGroups.length})</h2>
              <div className="d-flex flex-column gap-2">
                {pageAgencyGroups.map((group) => (
                  <MergeGroupCard
                    key={group.key}
                    title={group.rows[0].name}
                    editHrefBase="/admin/agencies"
                    rows={group.rows.map((a) => ({
                      id: a.id,
                      label: a.name,
                      sublabel: `${a._count.performers} артистов, ${a._count.dramas} сериалов, ${a._count.favoritedBy} в избранном`,
                    }))}
                    onMerge={mergeAgenciesAction}
                    dismissLabel={showHidden ? "Вернуть в дубли" : "Не сливать"}
                    onDismiss={(showHidden ? restoreDuplicateGroupAction : dismissDuplicateGroupAction).bind(
                      null,
                      "agency",
                      groupMemberKey(group.rows),
                    )}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        buildHref={(p) => `/admin/duplicates?${compareParams}${showHidden ? "hidden=1&" : ""}page=${p}`}
      />
    </div>
  );
}
