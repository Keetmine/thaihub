"use client";

import AppLink from "@/components/AppLink";

import { useState } from "react";
import { useT } from "@/components/LocaleProvider";
import { requestPasswordReset } from "./actions";

export default function ForgotForm() {
  const t = useT();
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
      <p className="small text-success text-center mb-0">✓ {t.auth.forgot.sent}</p>
    );
  }
  if (state === "smtp") {
    return (
      <p className="small text-warning text-center mb-0">
        {t.auth.forgot.smtpDown}{" "}
        <AppLink href="/help#feedback" className="link-body-emphasis">
          {t.auth.forgot.smtpFormLink}
        </AppLink>
        {t.auth.forgot.smtpAfter}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <label className="form-label" htmlFor="forgot-form-email">{t.auth.forgot.email}</label>
      <input id="forgot-form-email" type="email" name="email" required autoFocus className="form-control mb-3" />
      <button type="submit" className="btn btn-primary w-100" disabled={state === "sending"}>
        {state === "sending" ? t.auth.forgot.sending : t.auth.forgot.submit}
      </button>
    </form>
  );
}
