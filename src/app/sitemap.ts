import type { MetadataRoute } from "next";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { SITE_URL } from "@/lib/seo";
import { LOCALES, localeHref } from "@/lib/i18n/config";
import { CATALOG_TAG } from "@/lib/catalogCache";

// Считается на запрос, а не на сборке: внутри `docker build` базы нет,
// и попытка пререндера роняла весь билд (DatabaseNotReachable). Плюс
// каталог пополняется постоянно — статический слепок времени сборки
// устаревал бы к первому же импорту.
export const dynamic = "force-dynamic";

// Роботы дёргают sitemap постоянно, а это шесть полных выборок
// каталога — кэшируем на полчаса; админская правка каталога сбрасывает
// кэш раньше (тег catalog в logAudit).
const getCatalogSlugs = unstable_cache(
  async () =>
    Promise.all([
      prisma.drama.findMany({ select: { slug: true, id: true }, where: { slug: { not: null } } }),
      prisma.performer.findMany({ select: { slug: true, id: true }, where: { slug: { not: null } } }),
      prisma.novel.findMany({ select: { slug: true, id: true }, where: { slug: { not: null } } }),
      prisma.location.findMany({ select: { slug: true, id: true }, where: { slug: { not: null }, createdByUserId: null } }),
      prisma.agency.findMany({ select: { slug: true, id: true }, where: { slug: { not: null } } }),
      prisma.wikiArticle.findMany({ select: { slug: true, id: true, updatedAt: true }, where: { published: true } }),
    ]),
  ["sitemap-catalog"],
  { revalidate: 1800, tags: [CATALOG_TAG] },
);

// Sitemap открытого каталога: сериалы, артисты, новеллы, локации,
// агентства, вики. События опущены — их страницы за премиум-гейтом.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [dramas, performers, novels, locations, agencies, wiki] = await getCatalogSlugs();

  // Каждая страница попадает в карту ДВАЖДЫ — по разу на язык, и у
  // каждой записи проставлены alternates: так поисковик видит, что это
  // две версии одной страницы, а не дубли. Английский живёт на путях
  // без префикса, русский — под /ru (см. docs/features/i18n.md).
  //
  // У карточек каталога даты нет намеренно.
  //
  // `updatedAt` — это `@updatedAt`: Prisma освежает его на КАЖДОМ
  // UPDATE, даже когда записаны те же самые значения. Массовый прогон
  // синхронизации проходит по всему каталогу — и дата у тысяч страниц
  // становится сегодняшней, хотя для читателя не изменилось ничего.
  // Поисковику мы таким образом сообщали о правке, которой не было, а
  // он показывал её в выдаче: «Victor (Chatchawit Techarukpong) —
  // MyBLHub. 5 дней назад — …».
  //
  // Указания «не показывай дату» у поисковиков нет: дату убирают, убрав
  // сигналы, из которых она берётся. На карточках их больше нет —
  // ни в JSON-LD (Person/TVSeries без dateModified), ни в мете, ни в
  // тексте, — так что sitemap оставался единственным.
  //
  // У вики дата осталась: там правки живые, человеческие, и «обновлено»
  // читателю действительно что-то говорит.
  const entry = (path: string, lastModified?: Date): MetadataRoute.Sitemap => {
    const languages = Object.fromEntries(
      LOCALES.map((l) => [l, `${SITE_URL}${localeHref(path, l)}`]),
    );
    return LOCALES.map((l) => ({
      url: `${SITE_URL}${localeHref(path, l)}`,
      ...(lastModified ? { lastModified } : {}),
      alternates: { languages },
    }));
  };

  return [
    ...entry("/"),
    ...entry("/about"),
    ...entry("/dramas"),
    ...entry("/artists"),
    ...entry("/novels"),
    ...entry("/locations"),
    ...entry("/wiki"),
    ...dramas.flatMap((d) => entry(`/dramas/${d.slug}`)),
    ...performers.flatMap((p) => entry(`/artists/${p.slug}`)),
    ...novels.flatMap((n) => entry(`/novels/${n.slug}`)),
    ...locations.flatMap((l) => entry(`/locations/${l.slug}`)),
    ...agencies.flatMap((a) => entry(`/agencies/${a.slug}`)),
    ...wiki.flatMap((w) => entry(`/wiki/${w.slug ?? w.id}`, w.updatedAt)),
  ];
}
