import Link from "next/link";
import { prisma } from "@/lib/prisma";
import NameSearchBox from "@/components/NameSearchBox";
import AlphabetIndexList from "@/components/AlphabetIndexList";
import DramaStatusButton from "@/components/DramaStatusButton";
import { getCurrentUser } from "@/lib/userAuth";
import { WATCH_STATUS_LABELS, WATCH_STATUS_ORDER } from "@/lib/watchStatus";
import { getDramaWatchStatuses } from "@/lib/favorites";
import type { DramaWatchStatusValue } from "../favorites/actions";

export const dynamic = "force-dynamic";

export default async function DramasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q: rawQ, status: rawStatus } = await searchParams;
  const q = (rawQ ?? "").trim();
  const status = WATCH_STATUS_ORDER.includes(rawStatus as DramaWatchStatusValue)
    ? (rawStatus as DramaWatchStatusValue)
    : null;

  const currentUser = await getCurrentUser();

  const dramas = await prisma.drama.findMany({
    where: {
      ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
      ...(status && currentUser
        ? { watchStatuses: { some: { userId: currentUser.id, status } } }
        : {}),
    },
    orderBy: { title: "asc" },
  });

  const statusByDramaId = await getDramaWatchStatuses(
    dramas.map((d) => d.id),
    currentUser?.id,
  );

  const statusQuery = q ? `&q=${encodeURIComponent(q)}` : "";

  return (
    <div>
      <span className="eyebrow">Каталог</span>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2.5rem" }}>
        Сериалы
      </h1>

      <div className="tab-bar-row">
        <div className="tab-bar">
          <Link
            href={`/dramas?${q ? `q=${encodeURIComponent(q)}` : ""}`}
            prefetch={false}
            className={`tab-bar-item ${!status ? "active" : ""}`}
          >
            Все
          </Link>
          {WATCH_STATUS_ORDER.map((s) => (
            <Link
              key={s}
              href={`/dramas?status=${s}${statusQuery}`}
              prefetch={false}
              className={`tab-bar-item ${status === s ? "active" : ""}`}
            >
              {WATCH_STATUS_LABELS[s]}
            </Link>
          ))}
        </div>
        <NameSearchBox
          action="/dramas"
          q={q}
          placeholder="Поиск по названию…"
          hiddenFields={status ? { status } : undefined}
          className=""
        />
      </div>

      <AlphabetIndexList
        items={dramas.map((d) => ({ id: d.id, name: d.title, drama: d }))}
        emptyMessage={q || status ? "Ничего не найдено." : "Пока нет сериалов."}
        renderItem={({ drama: d }) => (
          <div
            key={d.id}
            className="surface surface-hover d-flex align-items-center justify-content-between gap-3 p-3"
          >
            <Link
              href={`/dramas/${d.id}`}
              className="text-decoration-none d-flex align-items-center gap-3"
              style={{ minWidth: 0 }}
            >
              <div
                style={{
                  width: "2.75rem",
                  height: "3.75rem",
                  borderRadius: "0.5rem",
                  background: "var(--bs-secondary-bg)",
                  flexShrink: 0,
                  overflow: "hidden",
                }}
              >
                {d.posterUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={d.posterUrl}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <p className="font-display fw-medium text-white mb-0 text-truncate">{d.title}</p>
                {d.year && <p className="small text-secondary mb-0">{d.year}</p>}
              </div>
            </Link>
            <DramaStatusButton
              dramaId={d.id}
              status={statusByDramaId.get(d.id) ?? null}
              className="flex-shrink-0"
            />
          </div>
        )}
      />
    </div>
  );
}
