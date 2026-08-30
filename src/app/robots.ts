import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// Каталог открыт для поиска (см. features/auth.md): сериалы, артисты,
// новеллы, локации, агентства и вики индексируются, всё личное и
// служебное — нет. Афиша событий за премиум-гейтом, поэтому /event и
// /day тоже закрыты: индексировать страницу-редирект на /login смысла
// нет.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/account",
          "/api",
          "/trips",
          "/lists",
          "/artist-lists",
          "/users",
          "/login",
          "/signup",
          "/welcome",
          "/forgot-password",
          "/reset-password",
          // Афиша за премиум-гейтом, оба раздела закрыты ЯВНО и
          // раздельно, а не одним префиксом «/event» (он матчил бы оба
          // молча): /event/ — карточки событий /event/[id] (на них же
          // стоит noindex-мета — страховка от прямых ссылок, правила
          // не противоречат), /events — список афиши.
          "/event/",
          "/events",
          "/day",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
