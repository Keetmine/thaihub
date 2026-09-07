"use client";

import { useId, useState } from "react";
import Modal from "@/components/Modal";
import { useT } from "@/components/LocaleProvider";
import { createCommunityPlaceList } from "../placeActions";

/**
 * «Создать список» на вкладке «Места» сообщества.
 *
 * Своя форма, а не общая `CreateListButton` со страницы «Мои места»:
 * у списка сообщества другой набор полей — видимость здесь не три
 * состояния, а галочка «показывать всем» (дружба к сообществу отношения
 * не имеет), и экшен свой, с проверкой роли в сообществе.
 *
 * Кнопка рисуется только тем, у кого есть права, но правом это не
 * является: экшен перепроверяет роль на сервере.
 */
export default function PlaceListCreateButton({ communityId }: { communityId: string }) {
  const uid = useId();
  const t = useT();
  const s = t.communities.places;
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setIsSaving(true);
    setError(null);
    try {
      // При успехе экшен уводит redirect'ом на страницу списка — сюда
      // возвращается только отказ.
      const result = await createCommunityPlaceList(communityId, formData);
      if (result && !result.ok) setError(result.error);
    } catch {
      setError(s.createFailed);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsOpen(true)}>
        + {s.create}
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
              rows={2}
              placeholder={s.descriptionPlaceholder}
              className="form-control"
            />
          </div>
          <div className="form-check">
            {/* По умолчанию выключено: наружу список выносит ЖЕСТ, а не
                пропущенное поле формы. */}
            <input
              id={`${uid}-public`}
              type="checkbox"
              name="public"
              className="form-check-input"
            />
            <label className="form-check-label small" htmlFor={`${uid}-public`}>
              {s.publicLabel}
            </label>
            <p className="small text-secondary mt-1 mb-0">{s.publicHint}</p>
          </div>
          {error && <p className="small text-danger mb-0">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            {isSaving ? s.creating : s.submit}
          </button>
        </form>
      </Modal>
    </>
  );
}
