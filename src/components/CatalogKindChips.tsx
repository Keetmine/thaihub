import AppLink from "@/components/AppLink";
import { getT } from "@/lib/i18n";
import { CATALOG_KINDS, kindHref, type CatalogKind } from "@/lib/catalogKinds";

/**
 * Ряд разделов каталога: Сериалы · Фильмы · Шоу · Новеллы.
 *
 * Все четыре — обычные ссылки, и это важно. Первые три меняют фильтр на
 * /dramas, четвёртая ведёт на /novels (у новеллы своя таблица и своя
 * карточка). Снаружи разницы нет, а адреса остаются прежними — после
 * августовского переезда языков трафик из поиска ещё не отыгран, и
 * второй переезд URL сейчас недопустим (см. docs/features/seo.md).
 *
 * Рисуется и на /dramas, и на /novels: один ряд на обеих страницах —
 * то, что делает из двух разделов один «Каталог».
 */
export default async function CatalogKindChips({
  active,
}: {
  /** Подсвеченный раздел; `null` — ни один (страница поиска: ищем по
   *  всему каталогу, и подсветка врала бы). */
  active: CatalogKind | null;
}) {
  const { t } = await getT();
  return (
    <nav className="d-flex flex-wrap gap-2 mb-4" aria-label={t.catalog.kinds.aria}>
      {CATALOG_KINDS.map((kind) => (
        <AppLink
          key={kind}
          href={kindHref(kind)}
          prefetch={false}
          className={`chip-link${kind === active ? " is-active" : ""}`}
          aria-current={kind === active ? "page" : undefined}
        >
          {t.catalog.kinds[kind]}
        </AppLink>
      ))}
    </nav>
  );
}
