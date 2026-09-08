import AppLink from "@/components/AppLink";
import EmptyState from "@/components/EmptyState";
import { prisma } from "@/lib/prisma";
import LocationMap from "@/components/LocationMapLoader";
import { pageMetadata } from "@/lib/seo";
import { getT } from "@/lib/i18n";
import { getCurrentUser } from "@/lib/userAuth";

export async function generateMetadata() {
  const { t } = await getT();
  return pageMetadata({
    title: t.catalog.map.metaTitle,
    description: t.catalog.map.metaDescription,
    path: "/locations/map",
  });
}

export const dynamic = "force-dynamic";

/** Только у мест с координатами: без них маркера не поставить. */
const MAPPABLE = { latitude: { not: null }, longitude: { not: null } } as const;

/** Поля маркера — четыре штуки: полные строки (описание, адрес,
 *  источники) на карте не нужны и утяжеляли страницу. */
const MARKER_SELECT = {
  id: true,
  name: true,
  latitude: true,
  longitude: true,
} as const;

export default async function LocationsMapPage({
  searchParams,
}: {
  searchParams: Promise<{ mine?: string }>;
}) {
  const { t } = await getT();
  const { mine } = await searchParams;
  const user = await getCurrentUser();

  // Вкладка «Из моих сериалов» (аудит 2026-09, §6 п.7): на общей карте
  // 600 с лишним точек, и найти среди них съёмки того, что человек
  // реально смотрит, нельзя. Отбор — как у «моих сериалов» в календаре
  // и на главной: сериал считается отмеченным при ЛЮБОМ статусе
  // просмотра (смотрю, посмотрел, буду смотреть), потому что в поездку
  // едут и за тем, что ещё только собираются посмотреть.
  //
  // Гостю вкладки нет вовсе: отмечать сериалы ему негде, и вкладка
  // обещала бы содержимое, которого у него быть не может.
  const onlyMine = !!user && mine === "1";
  const mineWhere = user
    ? {
        ...MAPPABLE,
        dramas: { some: { drama: { watchStatuses: { some: { userId: user.id } } } } },
      }
    : null;

  // Счётчик в подписи вкладки считаем всегда, когда вкладка вообще
  // рисуется: по нему сразу видно, есть ли ради чего переключаться, — и
  // пустую вкладку мы не предлагаем (как «Мои» на главной).
  const [locations, mineCount] = await Promise.all([
    prisma.location.findMany({
      where: {
        // Свои и чужие пользовательские места на общей карте не живут —
        // это каталог (см. locations/page.tsx).
        createdByUserId: null,
        ...MAPPABLE,
        ...(onlyMine && mineWhere ? mineWhere : {}),
      },
      select: MARKER_SELECT,
      orderBy: { name: "asc" },
    }),
    mineWhere
      ? prisma.location.count({ where: { createdByUserId: null, ...mineWhere } })
      : Promise.resolve(0),
  ]);

  const showTabs = !!user && mineCount > 0;

  return (
    <div>
      <AppLink href="/locations" className="eyebrow text-decoration-none">
        {t.catalog.map.back}
      </AppLink>
      <h1 className="display-1-tight mt-3 mb-5" style={{ fontSize: "2.5rem" }}>
        {t.catalog.map.title}
      </h1>

      {/* Ряд вкладок общий с остальным сайтом (tab-bar-item), состояние —
          в адресе: ссылкой на «из моих сериалов» можно поделиться, и без
          JS переключатель тоже работает. */}
      {showTabs && (
        <div className="tab-bar-row mb-3">
          <nav className="tab-bar" aria-label={t.catalog.map.tabsLabel}>
            <AppLink
              href="/locations/map"
              prefetch={false}
              className={`tab-bar-item ${onlyMine ? "" : "active"}`}
              aria-current={onlyMine ? undefined : "page"}
            >
              {t.catalog.map.tabAll}
            </AppLink>
            <AppLink
              href="/locations/map?mine=1"
              prefetch={false}
              className={`tab-bar-item ${onlyMine ? "active" : ""}`}
              aria-current={onlyMine ? "page" : undefined}
            >
              {t.catalog.map.tabMine(mineCount)}
            </AppLink>
          </nav>
        </div>
      )}

      {locations.length === 0 ? (
        // Пусто на «моих» и пусто вообще — разные беды: в первом случае
        // человеку надо сказать, что дело в отметках, а не в карте.
        <EmptyState
          emoji="🗺️"
          title={onlyMine ? t.catalog.map.emptyMineTitle : t.catalog.map.emptyTitle}
          hint={onlyMine ? t.catalog.map.emptyMineHint : t.catalog.map.emptyHint}
          compact
        />
      ) : (
        <LocationMap
          locations={locations.map((l) => ({
            id: l.id,
            name: l.name,
            latitude: l.latitude as number,
            longitude: l.longitude as number,
          }))}
          height="36rem"
        />
      )}
    </div>
  );
}
