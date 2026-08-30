import { renderSitemapIndex, SITEMAP_HEADERS } from "@/lib/sitemapShards";

// Sitemap index по старому адресу /sitemap.xml — он отправлен владельцем
// в Google Search Console и Яндекс.Вебмастер, ломать его нельзя. Ссылки
// ведут на шарды /sitemap/<id>.xml (src/app/sitemap/[shard]/route.ts).
// Почему это обычный route-handler, а не файл-конвенция sitemap.ts с
// generateSitemaps — разобрано в src/lib/sitemapShards.ts.
//
// Директория названа «sitemap.xml», а не «sitemap»: имя каталога и есть
// путь, а под метаданные Next её не забирает — isMetadataRouteFile ловит
// файл, ОКАНЧИВАЮЩИЙСЯ на sitemap.xml, а не .../sitemap.xml/route.ts.

// Считается на запрос, а не на сборке: внутри `docker build` базы нет,
// и попытка пререндера роняла весь билд (DatabaseNotReachable).
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return new Response(await renderSitemapIndex(), { headers: SITEMAP_HEADERS });
}
