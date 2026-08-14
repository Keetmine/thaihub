"use client";

import dynamic from "next/dynamic";
import type { MapLocation } from "./LocationMap";

// next/dynamic's ssr:false option is only allowed inside a Client Component
// boundary — this wrapper exists purely to provide that boundary for the
// (async, Server Component) pages that need to render a map.
const LocationMap = dynamic(() => import("./LocationMap"), {
  ssr: false,
  loading: () => (
    <div
      className="surface d-flex align-items-center justify-content-center text-secondary small"
      style={{ height: "100%", minHeight: "16rem" }}
    >
      Загрузка карты…
    </div>
  ),
});

export default function LocationMapLoader({
  locations,
  height,
}: {
  locations: MapLocation[];
  height?: string;
}) {
  return <LocationMap locations={locations} height={height} />;
}
