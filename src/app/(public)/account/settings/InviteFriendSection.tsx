"use client";

import { useState } from "react";
import { useT } from "@/components/LocaleProvider";

/**
 * Реферальная ссылка «Пригласить подругу» (аудит 2026-09 п.7):
 * зарегистрировавшаяся по ней сразу становится другом пригласившей.
 * Тот же приём, что у IcsFeedSection: origin берём из window, чтобы
 * ссылка совпадала с адресом, на котором человек сайт открыл.
 *
 * `refValue` — ник, а без ника id: ссылка с ником читаемая, ею не
 * стыдно делиться, а id — запасной вариант для тех, кто ник ещё не
 * придумал (signup-экшен принимает оба).
 */
export default function InviteFriendSection({ refValue }: { refValue: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/signup?ref=${encodeURIComponent(refValue)}`
      : `/signup?ref=${encodeURIComponent(refValue)}`;

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="d-flex flex-wrap gap-2">
      <input
        readOnly
        value={url}
        aria-label={t.social.friends.invite.aria}
        className="form-control"
        style={{ flex: "1 1 20rem" }}
      />
      <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleCopy}>
        {copied ? t.social.friends.invite.copied : t.social.friends.invite.copy}
      </button>
    </div>
  );
}
