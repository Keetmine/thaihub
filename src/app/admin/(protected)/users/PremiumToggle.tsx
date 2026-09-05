"use client";

import { useState, useTransition } from "react";
import { grantPremiumMonth, revokePremium, setPremiumLifetime } from "./actions";

function formatDate(d: Date): string {
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

/** Управление подпиской пользователя: показать срок, продлить на месяц,
 *  выдать бессрочную (чтобы не продлевать друзьям каждый месяц),
 *  отключить досрочно. Бессрочность снимается отдельной кнопкой и
 *  возвращает тот срок, что был до неё. */
export default function PremiumToggle({
  userId,
  premiumUntil,
  premiumLifetime,
}: {
  userId: string;
  premiumUntil: Date | null;
  premiumLifetime: boolean;
}) {
  const [until, setUntil] = useState(premiumUntil);
  const [lifetime, setLifetime] = useState(premiumLifetime);
  const [isPending, startTransition] = useTransition();
  const termActive = !!until && until > new Date();
  const isActive = lifetime || termActive;

  return (
    <div className="d-flex align-items-center gap-2">
      <span className={`small ${isActive ? "text-warning" : "text-secondary"}`}>
        {lifetime ? "бессрочно" : termActive ? `до ${formatDate(until!)}` : "Базовый"}
      </span>
      {lifetime ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm text-danger"
          disabled={isPending}
          title="Снять бессрочность — останется срок, какой был до неё"
          onClick={() =>
            startTransition(async () => {
              await setPremiumLifetime(userId, false);
              setLifetime(false);
            })
          }
        >
          Снять бессрочно
        </button>
      ) : (
        <>
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
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={isPending}
            title="Подписка навсегда, продлевать не нужно"
            onClick={() =>
              startTransition(async () => {
                await setPremiumLifetime(userId, true);
                setLifetime(true);
              })
            }
          >
            Бессрочно
          </button>
          {termActive && (
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
        </>
      )}
    </div>
  );
}
