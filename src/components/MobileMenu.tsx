"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export default function MobileMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="d-sm-none ms-auto order-1">
      <button
        type="button"
        className="burger-btn"
        aria-label={open ? "Закрыть меню" : "Открыть меню"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={open ? "burger-line-1" : ""} />
        <span className={open ? "burger-line-2" : ""} />
        <span className={open ? "burger-line-3" : ""} />
      </button>
      {open && <div className="mobile-menu-panel">{children}</div>}
    </div>
  );
}
