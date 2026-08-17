"use client";

import { Children, useEffect, useRef, useState } from "react";

/** Ленивая порционная отрисовка списка: показываем первые `batch`
 *  элементов, дальше сентинел внизу подгружает следующую порцию, когда
 *  доезжаешь до конца (IntersectionObserver — работает и внутри
 *  контейнеров с собственным скроллом). Данные уже на клиенте — «лениво»
 *  только монтирование в DOM, поэтому большие списки не тормозят рендер. */
export default function LazyList({
  children,
  batch = 30,
}: {
  children: React.ReactNode;
  batch?: number;
}) {
  const items = Children.toArray(children);
  const [visible, setVisible] = useState(batch);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || visible >= items.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible((v) => Math.min(v + batch, items.length));
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible, items.length, batch]);

  return (
    <>
      {items.slice(0, visible)}
      {visible < items.length && <div ref={sentinelRef} style={{ height: 1 }} aria-hidden />}
    </>
  );
}
