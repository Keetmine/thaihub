"use client";

import { useEffect, useState } from "react";
import { useT } from "@/components/LocaleProvider";

// Плавающая кнопка «наверх»: появляется после прокрутки на ~2 экрана.
export default function ScrollTopButton() {
  const t = useT();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setVisible(window.scrollY > 900));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  if (!visible) return null;
  return (
    <button
      type="button"
      aria-label={t.widgets.scrollTop}
      className="scroll-top-btn"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
    >
      ↑
    </button>
  );
}
