import { notFound } from "next/navigation";

// Catch-all для несуществующих путей: без него URL вне известных роутов
// (например /fadfdaf) падал в корневой not-found БЕЗ публичного лейаута
// (ни шапки, ни футера). Этот роут ловит всё неизвестное внутрь группы
// (public) и триггерит её not-found — 404 с шапкой и футером.
export default function MissingPage() {
  notFound();
}
