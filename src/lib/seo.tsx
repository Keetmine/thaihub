// SEO-хелперы открытого каталога: базовый URL и JSON-LD-строители.
// generateMetadata живут в самих страницах, тут — общее.

export const SITE_URL = process.env.SITE_URL ?? "https://myblhub.com";

export function personJsonLd(p: {
  name: string;
  realName: string | null;
  photoUrl: string | null;
  birthDate: Date | null;
  slug: string | null;
  id: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: p.name,
    ...(p.realName ? { alternateName: p.realName } : {}),
    ...(p.photoUrl ? { image: `${SITE_URL}${p.photoUrl}` } : {}),
    ...(p.birthDate ? { birthDate: p.birthDate.toISOString().slice(0, 10) } : {}),
    url: `${SITE_URL}/artists/${p.slug ?? p.id}`,
  };
}

export function tvSeriesJsonLd(d: {
  title: string;
  synopsis: string | null;
  posterUrl: string | null;
  year: number | null;
  slug: string | null;
  id: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "TVSeries",
    name: d.title,
    ...(d.synopsis ? { description: d.synopsis.slice(0, 500) } : {}),
    ...(d.posterUrl ? { image: `${SITE_URL}${d.posterUrl}` } : {}),
    ...(d.year ? { datePublished: String(d.year) } : {}),
    url: `${SITE_URL}/dramas/${d.slug ?? d.id}`,
  };
}

/** <script type="application/ld+json"> без клиентского кода. */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
