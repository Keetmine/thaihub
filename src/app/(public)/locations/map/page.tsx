import AppLink from "@/components/AppLink";
import { prisma } from "@/lib/prisma";
import LocationMap from "@/components/LocationMapLoader";
import { pageMetadata } from "@/lib/seo";
import { getT } from "@/lib/i18n";

export async function generateMetadata() {
  const { t } = await getT();
  return pageMetadata({
    title: t.catalog.map.metaTitle,
    description: t.catalog.map.metaDescription,
    path: "/locations/map",
  });
}


export const dynamic = "force-dynamic";

export default async function LocationsMapPage() {
  const { t } = await getT();
  // select — только четыре поля для маркеров: полные строки (описание,
  // адрес, источники) на карте не нужны и утяжеляли страницу.
  const locations = await prisma.location.findMany({
    where: {
      createdByUserId: null, latitude: { not: null }, longitude: { not: null } },
    select: { id: true, name: true, latitude: true, longitude: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <AppLink href="/locations" className="eyebrow text-decoration-none">
        {t.catalog.map.back}
      </AppLink>
      <h1 className="display-1-tight mt-3 mb-5" style={{ fontSize: "2.5rem" }}>
        {t.catalog.map.title}
      </h1>

      <LocationMap
        locations={locations.map((l) => ({
          id: l.id,
          name: l.name,
          latitude: l.latitude as number,
          longitude: l.longitude as number,
        }))}
        height="36rem"
      />
    </div>
  );
}
