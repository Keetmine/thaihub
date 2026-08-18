"use client";

import { useState } from "react";
import { submitFeedback } from "@/app/(public)/feedbackActions";

// Форма обращения (помощь + «не нашли в поиске»): вопрос / предложение /
// запрос на добавление сериала или актёра. context — откуда пришли
// (например, поисковый запрос), уходит в админку вместе с текстом.
export default function FeedbackForm({
  defaultKind = "QUESTION",
  context = "",
  compact = false,
  defaultEmail = "",
  emailRequired = false,
}: {
  defaultKind?: "QUESTION" | "SUGGESTION" | "CONTENT_REQUEST";
  context?: string;
  compact?: boolean;
  /** Почта аккаунта для залогиненных — подставляется в поле. */
  defaultEmail?: string;
  /** Аноним без почты не получит ответ — поле обязательно. */
  emailRequired?: boolean;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await submitFeedback(new FormData(e.currentTarget));
      if (result.ok) setDone(true);
      else setError(result.error);
    } catch {
      setError("Не удалось связаться с сервером, попробуйте ещё раз");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (done) {
    return (
      <p className="small text-success mb-0">
        ✓ Спасибо! Обращение отправлено — мы посмотрим и ответим при необходимости.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="d-flex flex-column gap-3">
      <input type="hidden" name="context" value={context} />
      <div>
        <label className="form-label">Тип обращения</label>
        <select name="kind" defaultValue={defaultKind} className="form-select">
          <option value="QUESTION">Вопрос</option>
          <option value="SUGGESTION">Предложение / идея</option>
          <option value="CONTENT_REQUEST">Добавьте сериал или актёра</option>
        </select>
      </div>
      <div>
        <label className="form-label">
          Почта для ответа{emailRequired ? "" : " (необязательно)"}
        </label>
        <input
          type="email"
          name="email"
          required={emailRequired}
          defaultValue={defaultEmail}
          placeholder="you@example.com"
          className="form-control"
        />
      </div>
      <div>
        <label className="form-label">Сообщение</label>
        <textarea
          name="text"
          required
          rows={compact ? 3 : 5}
          maxLength={4000}
          placeholder="Расскажите, что нашли, что сломалось или кого не хватает…"
          className="form-control"
        />
      </div>
      {error && <p className="small text-danger mb-0">{error}</p>}
      <div>
        <button type="submit" className="btn btn-primary btn-sm" disabled={isSubmitting}>
          {isSubmitting ? "Отправка…" : "Отправить"}
        </button>
      </div>
    </form>
  );
}
