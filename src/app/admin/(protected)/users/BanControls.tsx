"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { banUser, unbanUser } from "./banActions";

/** Что показать о действующей блокировке. Даты приходят уже строками:
 *  форматирует их сервер, иначе список и карточка разошлись бы с
 *  разметкой при гидрации. */
export type BanInfo = { at: string; reason: string | null; by: string | null };

/**
 * Заблокировать (с причиной) / разблокировать — в списке пользователей и
 * на карточке. Причина обязательна: она единственный след того, за что
 * человека выключили, и через полгода это единственное, что можно будет
 * прочитать.
 *
 * Кнопка дизейблится там, где сервер всё равно откажет (себя, админа) —
 * но обе проверки живут и в banActions: экшен зовётся по POST и без
 * этой кнопки.
 */
export default function BanControls({
  userId,
  userLabel,
  banned,
  blockedReason,
  compact = false,
}: {
  userId: string;
  userLabel: string;
  banned: BanInfo | null;
  /** Почему кнопка недоступна (себя/админа нельзя) — null, если можно. */
  blockedReason?: string | null;
  /** Компактный вид для строки списка: без блока с причиной. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? "Не удалось");
        return;
      }
      setOpen(false);
      setReason("");
      router.refresh();
    } catch {
      setError("Не удалось — попробуйте ещё раз");
    } finally {
      setBusy(false);
    }
  }

  if (banned) {
    return (
      <div className="d-inline-flex flex-column gap-1">
        <div className="d-flex flex-wrap align-items-center gap-2">
          <span className="badge rounded-pill text-bg-danger">Заблокирован</span>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => run(() => unbanUser(userId))}
            disabled={busy}
          >
            {busy ? "…" : "Разблокировать"}
          </button>
        </div>
        {!compact && (
          <span className="small text-secondary">
            {banned.at}
            {banned.by ? ` · ${banned.by}` : ""}
            {banned.reason ? ` · «${banned.reason}»` : ""}
          </span>
        )}
        {error && <span className="small text-danger">{error}</span>}
      </div>
    );
  }

  return (
    <div className="d-inline-flex flex-column gap-1">
      <button
        type="button"
        className="btn btn-sm btn-outline-danger"
        onClick={() => setOpen(true)}
        disabled={busy || !!blockedReason}
        title={blockedReason ?? "Не сможет войти и писать; написанное останется"}
      >
        Заблокировать
      </button>
      {error && !open && <span className="small text-danger">{error}</span>}

      <Modal open={open} onClose={() => setOpen(false)} title={`Заблокировать: ${userLabel}`}>
        <p className="small text-secondary">
          Человек не сможет войти и что-либо написать, а действующие сессии перестанут
          работать — он увидит экран с объяснением. Написанное им остаётся на местах:
          лишнее удаляется точечно.
        </p>
        <label className="form-label" htmlFor="ban-reason">
          Причина (видит только админ)
        </label>
        <textarea
          id="ban-reason"
          className="form-control mb-3"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          placeholder="Например: спам в обсуждениях после двух предупреждений"
        />
        {error && <p className="small text-danger">{error}</p>}
        <div className="d-flex gap-2 justify-content-end">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setOpen(false)}
            disabled={busy}
          >
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-outline-danger btn-sm"
            onClick={() => run(() => banUser(userId, reason))}
            disabled={busy || !reason.trim()}
          >
            {busy ? "Блокируем…" : "Заблокировать"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
