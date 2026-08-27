"use client";

import { useId, useState } from "react";
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
  onChange,
}: {
  defaultLatitude?: number | null;
  defaultLongitude?: number | null;
  /** Координаты уезжают наверх, потому что скрытые поля формы живут в
   *  LocationForm: карта грузится клиентски (ssr:false), и до её монтажа
   *  полей latitude/longitude в форме не было вовсе — сохранение в этот
   *  момент молча стирало координаты. */
  onChange?: (lat: number | null, lng: number | null) => void;
}) {
  const uid = useId();
  const [position, setPosition] = useState<[number, number] | null>(
    defaultLatitude != null && defaultLongitude != null
      ? [defaultLatitude, defaultLongitude]
      : null,
  );

  function apply(next: [number, number] | null) {
    setPosition(next);
    onChange?.(next ? next[0] : null, next ? next[1] : null);
  }

  return (
    <div>
      <div className="row g-2 mb-2">
        <div className="col-6">
          <label className="form-label small" htmlFor={`${uid}-input`}>Широта</label>
          <input id={`${uid}-input`}
            type="number"
            step="any"
            className="form-control form-control-sm"
            value={position ? position[0] : ""}
            onChange={(e) => {
              const lat = parseFloat(e.target.value);
              apply([Number.isFinite(lat) ? lat : (position?.[0] ?? 0), position?.[1] ?? 0]);
            }}
          />
        </div>
        <div className="col-6">
          <label className="form-label small" htmlFor={`${uid}-input2`}>Долгота</label>
          <input id={`${uid}-input2`}
            type="number"
            step="any"
            className="form-control form-control-sm"
            value={position ? position[1] : ""}
            onChange={(e) => {
              const lng = parseFloat(e.target.value);
              apply([position?.[0] ?? 0, Number.isFinite(lng) ? lng : (position?.[1] ?? 0)]);
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
          <ClickHandler onPick={(lat, lng) => apply([lat, lng])} />
          {position && <Marker position={position} icon={defaultIcon} />}
        </MapContainer>
      </div>
    </div>
  );
}
