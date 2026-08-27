"use client";

import { useState } from "react";
import { submitFeedback } from "@/app/(public)/feedbackActions";
import { useT } from "@/components/LocaleProvider";

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
  const t = useT();
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
      setError(t.widgets.feedback.failed);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (done) {
    return (
      <p className="small text-success mb-0">
        ✓ {t.widgets.feedback.thanks}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="d-flex flex-column gap-3">
      <input type="hidden" name="context" value={context} />
      <div>
        <label className="form-label" htmlFor="feedback-form-kind">{t.widgets.feedback.kind}</label>
        <select id="feedback-form-kind" name="kind" defaultValue={defaultKind} className="form-select">
          <option value="QUESTION">{t.widgets.feedback.kindQuestion}</option>
          <option value="SUGGESTION">{t.widgets.feedback.kindIdea}</option>
          <option value="CONTENT_REQUEST">{t.widgets.feedback.kindContent}</option>
        </select>
      </div>
      <div>
        <label className="form-label" htmlFor="feedback-form-email">
          {t.widgets.feedback.email}{emailRequired ? "" : t.widgets.feedback.optional}
        </label>
        <input id="feedback-form-email"
          type="email"
          name="email"
          required={emailRequired}
          defaultValue={defaultEmail}
          placeholder="you@example.com"
          className="form-control"
        />
      </div>
      <div>
        <label className="form-label" htmlFor="feedback-form-text">{t.widgets.feedback.message}</label>
        <textarea id="feedback-form-text"
          name="text"
          required
          rows={compact ? 3 : 5}
          maxLength={4000}
          placeholder={t.widgets.feedback.placeholder}
          className="form-control"
        />
      </div>
      {error && <p className="small text-danger mb-0">{error}</p>}
      <div>
        <button type="submit" className="btn btn-primary btn-sm" disabled={isSubmitting}>
          {isSubmitting ? t.widgets.feedback.sending : t.widgets.feedback.send}
        </button>
      </div>
    </form>
  );
}
