import Link from "next/link";
import { prisma } from "@/lib/prisma";
import LocationMap from "@/components/LocationMapLoader";

export const dynamic = "force-dynamic";

export default async function LocationsMapPage() {
  const locations = await prisma.location.findMany({
    where: { latitude: { not: null }, longitude: { not: null } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <Link href="/locations" className="eyebrow text-decoration-none">
        ← Все локации
      </Link>
      <h1 className="display-1-tight mt-3 mb-5" style={{ fontSize: "2.5rem" }}>
        Карта локаций
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
