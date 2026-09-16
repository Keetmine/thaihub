"use client";

import type { ReactNode } from "react";
import { useT } from "@/components/LocaleProvider";
import ScrollRow from "@/components/ScrollRow";

/**
 * Прокручиваемый ряд вкладок: тот же `.tab-bar`, что и был, с
 * растушёванными краями и кнопками «влево/вправо», когда ряд не влезает.
 *
 * Сам механизм переехал в `ScrollRow` (правка владельца 2026-09-16:
 * такие же стрелки понадобились лентам постеров). Здесь остались только
 * классы вкладок и подписи кнопок — заводить второй экземпляр тех же
 * наблюдателей ради лент было бы верным способом получить два ряда с
 * разным поведением.
 *
 * Дети — ГОТОВАЯ разметка вкладок (`.tab-bar-item`), какая была: и
 * серверные `AppLink`, и клиентские `<a>` профиля.
 */
export default function ScrollableTabs({
  children,
  activeKey,
  dense,
}: {
  /** Сами вкладки — элементы с классом `tab-bar-item`. */
  children: ReactNode;
  /** Ключ активной вкладки: при его смене ряд подтягивает активную
   *  вкладку в видимую часть. Серверным рядам не нужен — там смена
   *  вкладки это переход, и хватает эффекта при монтировании. */
  activeKey?: string;
  /** Поджатый шаг между вкладками — для рядов, где их под десяток
   *  (профиль, сообщество). Каталогам с тремя-четырьмя вкладками
   *  привычнее просторный шаг `.tab-bar`. */
  dense?: boolean;
}) {
  const t = useT();
  return (
    <ScrollRow
      // Обёртка, а не сам `.tab-bar-row`: в ряду рядом с вкладками часто
      // живут поиск и кнопки, и они должны остаться там же, где были.
      wrapperClassName={`tab-scroll${dense ? " tab-scroll-dense" : ""}`}
      rowClassName="tab-bar"
      btnPrefix="tab-scroll"
      // Подписи лежат в словаре профиля: там кнопки появились первыми, а
      // заводить второй ключ с тем же текстом ради нового места незачем.
      prevLabel={t.social.profile.tabsScrollPrev}
      nextLabel={t.social.profile.tabsScrollNext}
      activeSelector=".tab-bar-item.active"
      activeKey={activeKey}
    >
      {children}
    </ScrollRow>
  );
}
