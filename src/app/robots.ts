import type { MetadataRoute } from "next";

// Весь контент за логином/подпиской — индексировать нечего, кроме
// лендинга. Явный Disallow бережёт и от индексации страниц-редиректов
// на /login.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/$", disallow: "/" }],
  };
}
