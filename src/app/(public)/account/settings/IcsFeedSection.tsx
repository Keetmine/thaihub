"use client";

import { useState } from "react";
import { useT } from "@/components/LocaleProvider";
import { regenerateIcsToken } from "../actions";

export default function IcsFeedSection({ token }: { token: string }) {
  const t = useT();
  const [currentToken, setCurrentToken] = useState(token);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/calendar-feed/${currentToken}`
      : `/api/calendar-feed/${currentToken}`;

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRegenerate() {
    if (!confirm(t.account.settings.icsRegenerateConfirm)) return;
    setIsRegenerating(true);
    try {
      const next = await regenerateIcsToken();
      setCurrentToken(next);
    } finally {
      setIsRegenerating(false);
    }
  }

  return (
    <div className="d-flex flex-column gap-2">
      <p className="small text-secondary mb-0">{t.account.settings.icsHint}</p>
      <div className="d-flex flex-wrap gap-2">
        <input
          readOnly
          value={url}
          aria-label={t.account.settings.icsAria}
          className="form-control"
          style={{ flex: "1 1 20rem" }}
        />
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleCopy}>
          {copied ? t.account.settings.icsCopied : t.account.settings.icsCopy}
        </button>
      </div>
      <div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={handleRegenerate}
          disabled={isRegenerating}
        >
          {isRegenerating
            ? t.account.settings.icsRegenerating
            : t.account.settings.icsRegenerate}
        </button>
      </div>
    </div>
  );
}
