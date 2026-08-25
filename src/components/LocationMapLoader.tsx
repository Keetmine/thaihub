"use client";

import dynamic from "next/dynamic";
import { useT } from "@/components/LocaleProvider";
import type { MapLocation } from "./LocationMap";

// Отдельный компонент, а не разметка прямо в loading: параметр dynamic()
// вызывается вне React-дерева, а так подпись рисуется обычным
// компонентом — и может взять язык из контекста.
function MapLoading() {
  const t = useT();
  return (
    <div
      className="surface d-flex align-items-center justify-content-center text-secondary small"
      style={{ height: "100%", minHeight: "16rem" }}
    >
      {t.widgets.map.loading}
    </div>
  );
}

// next/dynamic's ssr:false option is only allowed inside a Client Component
// boundary — this wrapper exists purely to provide that boundary for the
// (async, Server Component) pages that need to render a map.
const LocationMap = dynamic(() => import("./LocationMap"), {
  ssr: false,
  loading: () => <MapLoading />,
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
