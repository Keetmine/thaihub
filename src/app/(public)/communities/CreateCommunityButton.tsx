"use client";

import { useId, useState } from "react";
import Modal from "@/components/Modal";
import { createCommunity } from "./actions";
import { useT } from "@/components/LocaleProvider";

/**
 * Кнопка «Создать сообщество» с формой в окне — как у списков мест
 * (`CreateListButton`): три поля, две радиогруппы, и при успехе экшен
 * сам уводит на страницу нового сообщества.
 *
 * Обе настройки спрашиваем сразу, а не прячем в «изменить»: кто увидит
 * сообщество и кого в него пускать — решения, которые задают ему смысл,
 * и менять их задним числом неприятно (люди уже вступили).
 */
export default function CreateCommunityButton() {
  const uid = useId();
  const t = useT();
  const s = t.communities;
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");

  async function handleSubmit(formData: FormData) {
    setIsSaving(true);
    setError(null);
    try {
      // При успехе экшен уводит redirect'ом — сюда возвращается только
      // ошибка валидации.
      const result = await createCommunity(formData);
      if (result) setError(result.error);
    } catch {
      setError(s.errors.titleRequired);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => setIsOpen(true)}>
        {s.create}
      </button>

      <Modal
        open={isOpen}
        onClose={() => {
          setIsOpen(false);
          setError(null);
        }}
        title={s.createTitle}
      >
        <form action={handleSubmit} className="d-flex flex-column gap-3">
          <div>
            <label className="form-label small text-secondary" htmlFor={`${uid}-title`}>
              {s.titleLabel}
            </label>
            <input
              id={`${uid}-title`}
              type="text"
              name="title"
              required
              autoFocus
              maxLength={80}
              placeholder={s.titlePlaceholder}
              className="form-control"
            />
          </div>

          <div>
            <label className="form-label small text-secondary" htmlFor={`${uid}-description`}>
              {s.descriptionLabel}
            </label>
            <textarea
              id={`${uid}-description`}
              name="description"
              rows={3}
              maxLength={2000}
              placeholder={s.descriptionPlaceholder}
              className="form-control"
            />
          </div>

          <fieldset>
            <legend className="form-label small text-secondary">{s.visibilityLabel}</legend>
            <div className="d-flex flex-column gap-1">
              {(["PUBLIC", "PRIVATE"] as const).map((value) => (
                <label key={value} className="form-check small mb-0">
                  <input
                    type="radio"
                    name="visibility"
                    value={value}
                    className="form-check-input"
                    checked={visibility === value}
                    onChange={() => setVisibility(value)}
                  />{" "}
                  {s.visibility[value]}
                </label>
              ))}
            </div>
            {/* Пояснение меняется вместе с выбором: разница между
                «видят все» и «только по ссылке» — не про красоту, и
                человек должен понимать её до того, как позовёт людей. */}
            <p className="form-text mb-0">{s.visibilityHint[visibility]}</p>
          </fieldset>

          <fieldset>
            <legend className="form-label small text-secondary">{s.joinModeLabel}</legend>
            <div className="d-flex flex-column gap-1">
              {(["OPEN", "APPROVAL"] as const).map((value, i) => (
                <label key={value} className="form-check small mb-0">
                  <input
                    type="radio"
                    name="joinMode"
                    value={value}
                    defaultChecked={i === 0}
                    className="form-check-input"
                  />{" "}
                  {s.joinMode[value]}
                </label>
              ))}
            </div>
          </fieldset>

          {error && <p className="small text-danger mb-0">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            {s.create}
          </button>
        </form>
      </Modal>
    </>
  );
}
