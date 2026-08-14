import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ThaiHub — трекер тайских BL-событий",
    short_name: "ThaiHub",
    description: "Расписание концертов и фан-событий тайских BL-актёров",
    start_url: "/",
    display: "standalone",
    background_color: "#160a1c",
    theme_color: "#160a1c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
