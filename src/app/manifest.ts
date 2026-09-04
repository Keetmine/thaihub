import type { MetadataRoute } from "next";

// Манифест одноязычный, английский — и это осознанно.
//
// Он один на весь сайт и живёт по адресу /manifest.webmanifest без
// языкового префикса (localeHref его не вешает, и браузер запрашивает
// файл сам). Значит, proxy кладёт этому запросу язык по умолчанию —
// английский — и переключать здесь нечего: язык зрителя до манифеста
// просто не доезжает. Плюс имя и описание браузер запоминает в момент
// установки приложения, и подмешивать сюда куку значило бы, что ярлык
// на телефоне подписан тем языком, который был выбран в тот день.
// Поэтому берём язык сайта по умолчанию.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MyBLHub — fan events tracker",
    short_name: "MyBLHub",
    description: "Concerts and fan events with the actors, all on one schedule",
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
