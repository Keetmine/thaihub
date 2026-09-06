"use client";

import { useEffect } from "react";

/**
 * Раскрывает вопрос, на который пришли по ссылке с якорем.
 *
 * Сама раскрывашка — обычный `<details>`, и якорь на ней браузер честно
 * проматывает, но открыть не может: закрытый `details` открывается сам,
 * только когда цель фрагмента лежит ВНУТРИ него, а тут цель — он сам.
 * Поэтому ссылку на конкретный вопрос доводит до конца этот компонент:
 * ставит `open` и подводит вопрос к верху экрана (сразу после перехода
 * заголовок оказывался под липкой шапкой).
 *
 * Слушаем и `hashchange`: оглавление и решётка у вопроса — обычные
 * ссылки на той же странице, перезагрузки не будет.
 */
export default function FaqHashOpener() {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const el = document.getElementById(id);
      if (el instanceof HTMLDetailsElement) {
        el.open = true;
        // Скролл после открытия: до него высота элемента ещё нулевая, и
        // браузер целится в свёрнутую строку.
        el.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);

  return null;
}
