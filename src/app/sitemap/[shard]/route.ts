import { renderSitemapShard, SITEMAP_HEADERS } from "@/lib/sitemapShards";

// Шарды карты сайта: /sitemap/dramas-1.xml, /sitemap/artists-3.xml,
// /sitemap/pages.xml. Перечислены в индексе — /sitemap.xml
// (src/app/sitemap.xml/route.ts); состав и разбиение — в
// src/lib/sitemapShards.ts.

// Считается на запрос, а не на сборке: внутри `docker build` базы нет,
// и попытка пререндера роняла весь билд (DatabaseNotReachable). Плюс
// каталог пополняется постоянно — статический слепок времени сборки
// устаревал бы к первому же импорту.
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shard: string }> },
): Promise<Response> {
  const { shard } = await params;
  // Расширение — часть последнего сегмента пути, а не отдельный сегмент:
  // адрес должен оканчиваться на .xml, иначе роботы и валидаторы гадают
  // по Content-Type.
  if (!shard.endsWith(".xml")) return new Response("Not Found", { status: 404 });

  const body = await renderSitemapShard(shard.slice(0, -".xml".length));
  // Несуществующий раздел или номер за пределами разбиения — честный
  // 404, а не пустая карта: пустой <urlset> поисковик воспринял бы как
  // «этих страниц больше нет».
  if (!body) return new Response("Not Found", { status: 404 });

  return new Response(body, { headers: SITEMAP_HEADERS });
}
