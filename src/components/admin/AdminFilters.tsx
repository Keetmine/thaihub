import FilterPanel from "@/components/filters/FilterPanel";
import { countActiveFilters, type FilterDef, type FilterParams } from "@/lib/catalogFilters";

/**
 * Раскрывашка «Фильтры (N)» над админ-списком (И6).
 *
 * Свёрнута, пока фильтров нет, и раскрыта, когда что-то выбрано:
 * активный срез должен быть виден сразу, иначе список выглядит
 * «непонятно почему коротким». Панель внутри — та же, что на публичном
 * /search, в горизонтальной раскладке.
 */
export default function AdminFilters({
  defs,
  params,
}: {
  defs: FilterDef[];
  params: FilterParams;
}) {
  const active = countActiveFilters(defs, params);
  return (
    <details className="surface p-3 mb-3" open={active > 0}>
      <summary className="fw-semibold small">
        Фильтры{active > 0 ? ` (${active})` : ""}
      </summary>
      <div className="mt-3">
        <FilterPanel defs={defs} variant="bar" />
      </div>
    </details>
  );
}
