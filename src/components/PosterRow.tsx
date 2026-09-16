import ScrollRow from "@/components/ScrollRow";
import { getT } from "@/lib/i18n";

/**
 * Лента постеров с кнопками листания — серверная обёртка над `ScrollRow`
 * (правка владельца 2026-09-16: «везде на прокрутке нужно добавить слева
 * и справа кнопочки»).
 *
 * Отдельным компонентом, а не вызовом `ScrollRow` на каждой странице:
 * мест уже три (новые серии в каталоге, сериалы и альбомы на странице
 * артиста), и набор классов у них обязан совпадать — разъедется он
 * молча, а заметно станет только на узком экране.
 */
export default async function PosterRow({
  children,
  size = "md",
}: {
  children: React.ReactNode;
  /** `lg` — крупные карточки, шесть в ряд на широком экране (правка
   *  владельца 2026-09-16 для блока «Новые серии»). Ряды на странице
   *  артиста остаются базовыми: карточек там мало, и крупные распирали
   *  бы блок. */
  size?: "md" | "lg";
}) {
  const { t } = await getT();
  return (
    <ScrollRow
      wrapperClassName="scroll-row"
      // Без .thin-scroll: нативную полосу прячем совсем, вместо неё
      // ScrollRow рисует свою (showBar) — нативная на macOS наплывающая
      // и всегда видимой быть не может.
      rowClassName={`poster-row${size === "lg" ? " poster-row-lg" : ""}`}
      btnPrefix="scroll-row"
      prevLabel={t.common.scrollPrev}
      nextLabel={t.common.scrollNext}
      showBar
    >
      {children}
    </ScrollRow>
  );
}
