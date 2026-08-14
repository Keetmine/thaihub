import L from "leaflet";

// Leaflet's default marker icon references relative image paths that don't
// resolve under Next's bundler — point them at the copies we ship in
// /public/leaflet instead (kept local rather than a CDN so the map works
// without any external dependency at runtime).
export const defaultIcon = L.icon({
  iconUrl: "/leaflet/marker-icon.png",
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  shadowUrl: "/leaflet/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
