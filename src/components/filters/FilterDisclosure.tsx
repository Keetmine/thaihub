"use client";

import { useState } from "react";

/**
 * Раскрывашка «Фильтры» для узких экранов.
 *
 * Клиентская и с собственным состоянием — сознательно: серверный
 * `<details open={…}>` перерисовывается на каждую смену фильтра и
 * захлопывался прямо под руками (правка владельца — «нажимаю ещё раз,
 * и список сворачивается»).
 */
export default function FilterDisclosure({
  title,
  defaultOpen = false,
  className = "surface p-3 mb-2",
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className={className}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="fw-semibold">{title}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
