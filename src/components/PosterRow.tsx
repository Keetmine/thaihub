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
export default async function PosterRow({ children }: { children: React.ReactNode }) {
  const { t } = await getT();
  return (
    <ScrollRow
      wrapperClassName="scroll-row"
      rowClassName="poster-row thin-scroll"
      btnPrefix="scroll-row"
      prevLabel={t.common.scrollPrev}
      nextLabel={t.common.scrollNext}
    >
      {children}
    </ScrollRow>
  );
}
