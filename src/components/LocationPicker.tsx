"use client";

import { useState } from "react";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import { defaultIcon } from "@/lib/leafletIcon";

const DEFAULT_CENTER: [number, number] = [13.7563, 100.5018]; // Bangkok

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function LocationPicker({
  defaultLatitude,
  defaultLongitude,
}: {
  defaultLatitude?: number | null;
  defaultLongitude?: number | null;
}) {
  const [position, setPosition] = useState<[number, number] | null>(
    defaultLatitude != null && defaultLongitude != null
      ? [defaultLatitude, defaultLongitude]
      : null,
  );

  return (
    <div>
      <div className="row g-2 mb-2">
        <div className="col-6">
          <label className="form-label small">Широта</label>
          <input
            type="number"
            step="any"
            name="latitude"
            className="form-control form-control-sm"
            value={position ? position[0] : ""}
            onChange={(e) => {
              const lat = parseFloat(e.target.value);
              setPosition((prev) => [Number.isFinite(lat) ? lat : (prev?.[0] ?? 0), prev?.[1] ?? 0]);
            }}
          />
        </div>
        <div className="col-6">
          <label className="form-label small">Долгота</label>
          <input
            type="number"
            step="any"
            name="longitude"
            className="form-control form-control-sm"
            value={position ? position[1] : ""}
            onChange={(e) => {
              const lng = parseFloat(e.target.value);
              setPosition((prev) => [prev?.[0] ?? 0, Number.isFinite(lng) ? lng : (prev?.[1] ?? 0)]);
            }}
          />
        </div>
      </div>

      <p className="small text-secondary mb-2">Кликните на карте, чтобы указать точку.</p>

      <div
        className="leaflet-map-dark"
        style={{
          height: "18rem",
          overflow: "hidden",
          borderRadius: "var(--bs-border-radius-lg)",
          border: "1px solid var(--bs-border-color)",
        }}
      >
        <MapContainer
          center={position ?? DEFAULT_CENTER}
          zoom={position ? 15 : 6}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickHandler onPick={(lat, lng) => setPosition([lat, lng])} />
          {position && <Marker position={position} icon={defaultIcon} />}
        </MapContainer>
      </div>
    </div>
  );
}
