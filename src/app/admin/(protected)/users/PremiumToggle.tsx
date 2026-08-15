"use client";

import { useState, useTransition } from "react";
import { setUserPremium } from "./actions";

export default function PremiumToggle({
  userId,
  isPremium,
}: {
  userId: string;
  isPremium: boolean;
}) {
  const [checked, setChecked] = useState(isPremium);
  const [isPending, startTransition] = useTransition();

  function handleChange(next: boolean) {
    setChecked(next);
    startTransition(async () => {
      try {
        await setUserPremium(userId, next);
      } catch {
        setChecked(!next);
      }
    });
  }

  return (
    <div className="form-check form-switch mb-0">
      <input
        className="form-check-input"
        type="checkbox"
        role="switch"
        id={`premium-${userId}`}
        checked={checked}
        disabled={isPending}
        onChange={(e) => handleChange(e.target.checked)}
      />
      <label
        className={`form-check-label small ${checked ? "text-warning" : "text-secondary"}`}
        htmlFor={`premium-${userId}`}
      >
        {checked ? "Подписка" : "Базовый"}
      </label>
    </div>
  );
}
