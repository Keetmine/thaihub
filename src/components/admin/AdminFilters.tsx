import FilterChips from "@/components/filters/FilterChips";
import FilterDisclosure from "@/components/filters/FilterDisclosure";
import FilterPanel from "@/components/filters/FilterPanel";
import { countActiveFilters, type FilterDef, type FilterParams } from "@/lib/catalogFilters";

/**
 * Колонка фильтров админ-списка (И6) — как на публичном /search
 * (правка владельца): на широком экране справа от списка и липнет под
 * шапкой, на узком — раскрывашка над ним. Чипы выбранного — в том же
 * блоке, что и сами фильтры.
 *
 * Страница кладёт список в `col-12 col-xl-9`, а этот компонент — второй
 * колонкой того же `.row`. Раскрывашка — клиентская со своим
 * состоянием: серверный `<details>` перерисовывался на каждую смену
 * фильтра и захлопывался под руками.
 */
export default function AdminFilters({
  defs,
  params,
}: {
  defs: FilterDef[];
  params: FilterParams;
}) {
  const active = countActiveFilters(defs, params);
  const title = `Фильтры${active > 0 ? ` (${active})` : ""}`;
  return (
    <aside className="col-12 col-xl-3 order-first order-xl-last">
      <div className="d-xl-none">
        <FilterDisclosure title={title} defaultOpen={active > 0}>
          <FilterChips defs={defs} />
          <FilterPanel defs={defs} />
        </FilterDisclosure>
      </div>
      <div className="d-none d-xl-block search-filter-aside">
        <p className="section-heading mb-3">{title}</p>
        <FilterChips defs={defs} />
        <FilterPanel defs={defs} />
      </div>
    </aside>
  );
}
