"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sendBroadcast, type BroadcastResult } from "./actions";

export default function BroadcastForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (!window.confirm("Отправить рассылку? Отменить будет нельзя.")) return;
    setPending(true);
    setError(null);
    setResult(null);
    const form = e.currentTarget;
    try {
      const res = await sendBroadcast(new FormData(form));
      setResult(res);
      form.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="surface d-flex flex-column gap-3 p-4 mb-4">
      <div>
        <label className="form-label">Аудитория</label>
        <select name="audience" className="form-select" defaultValue="all">
          <option value="all">Все с Telegram</option>
          <option value="premium">Только с подпиской</option>
        </select>
      </div>
      <div>
        <label className="form-label">Текст сообщения</label>
        <textarea name="text" rows={4} required maxLength={3500} className="form-control" />
      </div>
      {error && <p className="small text-danger mb-0">{error}</p>}
      {result && (
        <p className="small text-success mb-0">
          ✓ Отправлено {result.sent} из {result.total}.
        </p>
      )}
      <div>
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? "Отправка…" : "Отправить рассылку"}
        </button>
      </div>
    </form>
  );
}
