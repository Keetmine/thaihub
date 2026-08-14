"use client";

import { useState } from "react";
import { regenerateIcsToken } from "../actions";

export default function IcsFeedSection({ token }: { token: string }) {
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
    if (!confirm("Старая ссылка перестанет работать. Обновить?")) return;
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
      <p className="small text-secondary mb-0">
        Подпишитесь на эту ссылку в календаре телефона (Google Calendar, Apple
        Calendar) — события, на которые вы отметили «Иду», будут появляться там
        сами.
      </p>
      <div className="d-flex flex-wrap gap-2">
        <input readOnly value={url} className="form-control" style={{ flex: "1 1 20rem" }} />
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleCopy}>
          {copied ? "Скопировано" : "Копировать"}
        </button>
      </div>
      <div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={handleRegenerate}
          disabled={isRegenerating}
        >
          {isRegenerating ? "Обновление…" : "Обновить ссылку"}
        </button>
      </div>
    </div>
  );
}
