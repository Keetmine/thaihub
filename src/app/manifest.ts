import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MyBLHub — трекер тайских BL-событий",
    short_name: "MyBLHub",
    description: "Расписание концертов и фан-событий тайских BL-актёров",
    start_url: "/",
    display: "standalone",
    // Фактический фон сайта — старый фиолетовый #160a1c красил
    // PWA-сплэш в чужой цвет.
    background_color: "#0a0a0c",
    theme_color: "#0a0a0c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
