"use client";

import { useState } from "react";
import { redeemPromoCode } from "@/app/(public)/promoActions";

/** Поле «У меня есть промокод» на пейволле. */
export default function PromoCodeRedeem() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("busy");
    try {
      const result = await redeemPromoCode(code);
      if (!result.ok) {
        setStatus("error");
        setMessage(result.error);
        return;
      }
      setStatus("done");
      setMessage(
        `Подписка активна до ${new Date(result.until).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })} — обновите страницу!`,
      );
    } catch {
      // Сеть/сервер недоступны — текст исключения из server action в
      // проде всё равно не доезжает, поэтому пишем своё.
      setStatus("error");
      setMessage("Не удалось связаться с сервером, попробуйте ещё раз");
    }
  }

  if (status === "done") {
    return <p className="small text-success mb-0">🎉 {message}</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="d-flex flex-column gap-2">
      <div className="d-flex gap-2 justify-content-center">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Промокод"
          aria-label="Промокод"
          className="form-control form-control-sm"
          style={{ maxWidth: "12rem" }}
        />
        <button type="submit" className="btn btn-ghost btn-sm" disabled={status === "busy" || !code.trim()}>
          {status === "busy" ? "…" : "Активировать"}
        </button>
      </div>
      {status === "error" && <p className="small text-danger mb-0">{message}</p>}
    </form>
  );
}
