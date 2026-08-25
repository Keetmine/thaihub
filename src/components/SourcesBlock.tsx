// Блок «Источники» — атрибуция первоисточников записи (обещана в
// /terms: «источники указаны на страницах записей»). Ссылки без url
// отбрасываются; если не осталось ни одной — блок не рисуется.
import { getT } from "@/lib/i18n";

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default async function SourcesBlock({
  links,
}: {
  links: { url: string | null | undefined; label?: string }[];
}) {
  const valid = links.filter((l): l is { url: string; label?: string } => !!l.url);
  if (valid.length === 0) return null;
  const { t } = await getT();
  return (
    <div className="mt-4 sources-block">
      <h2 className="section-heading mb-2" style={{ opacity: 0.55 }}>
        {t.catalog.sources}
      </h2>
      <p className="small mb-0 d-flex flex-wrap gap-3">
        {valid.map((l) => (
          <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer">
            {l.label ?? hostLabel(l.url)}
          </a>
        ))}
      </p>
    </div>
  );
}
