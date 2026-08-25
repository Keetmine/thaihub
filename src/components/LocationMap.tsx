"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import Link from "next/link";
import { defaultIcon, userPlaceIcon } from "@/lib/leafletIcon";
import { useT } from "@/components/LocaleProvider";

export type MapLocation = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Место, добавленное пользователем: рисуется другим цветом, чтобы на
   *  общей карте свои находки отличались от съёмочных площадок. */
  isUserPlace?: boolean;
};

export default function LocationMap({
  locations,
  height = "28rem",
}: {
  locations: MapLocation[];
  height?: string;
}) {
  const t = useT();
  if (locations.length === 0) {
    return <p className="small text-secondary">{t.widgets.map.empty}</p>;
  }

  const center: [number, number] = [
    locations.reduce((sum, l) => sum + l.latitude, 0) / locations.length,
    locations.reduce((sum, l) => sum + l.longitude, 0) / locations.length,
  ];

  return (
    <div
      className="leaflet-map-dark surface"
      style={{ height, overflow: "hidden", borderRadius: "var(--bs-border-radius-lg)" }}
    >
      <MapContainer
        center={center}
        zoom={locations.length === 1 ? 14 : 6}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {locations.map((l) => (
          <Marker
            key={l.id}
            position={[l.latitude, l.longitude]}
            icon={l.isUserPlace ? userPlaceIcon : defaultIcon}
          >
            <Popup>
              <Link href={`/locations/${l.id}`}>{l.name}</Link>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
