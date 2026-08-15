"use client";

import { useState, useTransition } from "react";
import { grantPremiumMonth, revokePremium } from "./actions";

function formatDate(d: Date): string {
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

/** Управление подпиской пользователя: показать срок, продлить на месяц,
 *  отключить досрочно. */
export default function PremiumToggle({
  userId,
  premiumUntil,
}: {
  userId: string;
  premiumUntil: Date | null;
}) {
  const [until, setUntil] = useState(premiumUntil);
  const [isPending, startTransition] = useTransition();
  const isActive = !!until && until > new Date();

  return (
    <div className="d-flex align-items-center gap-2">
      <span className={`small ${isActive ? "text-warning" : "text-secondary"}`}>
        {isActive ? `до ${formatDate(until!)}` : "Базовый"}
      </span>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await grantPremiumMonth(userId);
            const base = until && until > new Date() ? new Date(until) : new Date();
            base.setDate(base.getDate() + 30);
            setUntil(base);
          })
        }
      >
        +1 мес
      </button>
      {isActive && (
        <button
          type="button"
          className="btn btn-ghost btn-sm text-danger"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await revokePremium(userId);
              setUntil(null);
            })
          }
        >
          Снять
        </button>
      )}
    </div>
  );
}
