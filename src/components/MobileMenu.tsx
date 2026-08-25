"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useT } from "@/components/LocaleProvider";

export default function MobileMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const pathname = usePathname();
  const [prevPathname, setPrevPathname] = useState(pathname);

  // Close the menu on navigation. Adjusting state during render (rather than
  // in an effect) avoids an extra post-navigation render — see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  return (
    <div className="d-sm-none ms-auto order-1">
      <button
        type="button"
        className="burger-btn"
        aria-label={open ? t.nav.closeMenu : t.nav.openMenu}
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
