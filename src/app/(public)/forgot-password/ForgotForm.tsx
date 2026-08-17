"use client";

import Link from "next/link";

import { useState } from "react";
import { requestPasswordReset } from "./actions";

export default function ForgotForm() {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "smtp">("idle");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    const result = await requestPasswordReset(new FormData(e.currentTarget));
    setState(result.smtpMissing ? "smtp" : "sent");
  }

  if (state === "sent") {
    return (
      <p className="small text-success text-center mb-0">
        ✓ Если такой аккаунт существует — письмо со ссылкой уже в пути.
        Проверьте почту (и папку «Спам»).
      </p>
    );
  }
  if (state === "smtp") {
    return (
      <p className="small text-warning text-center mb-0">
        Автоматический сброс временно недоступен — напишите нам через{" "}
        <Link href="/help#feedback" className="link-body-emphasis">форму обращений</Link>, поможем руками.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <label className="form-label">Email</label>
      <input type="email" name="email" required autoFocus className="form-control mb-3" />
      <button type="submit" className="btn btn-primary w-100" disabled={state === "sending"}>
        {state === "sending" ? "Отправка…" : "Прислать ссылку"}
      </button>
    </form>
  );
}
