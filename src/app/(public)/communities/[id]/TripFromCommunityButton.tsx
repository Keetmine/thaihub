"use client";

import { useId, useState } from "react";
import Modal from "@/components/Modal";
import DatePickerInput from "@/components/DatePickerInput";
import EntityMultiSelect, { type EntityOption } from "@/components/EntityMultiSelect";
import { useT } from "@/components/LocaleProvider";
import { createCommunityTrip } from "../../trips/actions";
import { VisibilityRadios } from "../../trips/TripVisibilityControls";

/**
 * «Собрать поездку» — вторая связка сообщества с остальным сайтом
 * (АА25): в сообществе договариваются, а едут в поездке, где уже есть
 * план по дням, брони, чемодан и общие дела. Заводить всё это заново
 * руками, перепечатывая имена, — ровно та работа, которой сайт и должен
 * избавлять.
 *
 * Форма — та же, что у «Создать поездку» на /trips (Modal +
 * DatePickerInput + EntityMultiSelect + VisibilityRadios), и это
 * намеренно: человек уже знает, как она устроена, а вторая копия тех же
 * полей начала бы с ней расходиться. Отличается только список, из
 * которого выбирают людей: там друзья, здесь участники сообщества.
 *
 * Зовут ВЫБОРОЧНО, всё сообщество скопом не приглашается: поездка —
 * вещь личная, и попасть в чужие планы «за компанию» человек не должен.
 * Сервер перепроверяет каждый присланный id по составу сообщества —
 * спрятанный от глаз список правом не является.
 */
export default function TripFromCommunityButton({
  communityId,
  communityTitle,
  members,
}: {
  communityId: string;
  communityTitle: string;
  /** Действующие участники, кроме самого зрителя. */
  members: EntityOption[];
}) {
  const uid = useId();
  const t = useT();
  const s = t.communities.together;
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setIsSaving(true);
    setError(null);
    try {
      // При успехе экшен уводит redirect'ом на страницу поездки — сюда
      // возвращается только ошибка валидации/подписки/участия.
      const result = await createCommunityTrip(communityId, formData);
      if (result) setError(result.error);
    } catch {
      setError(t.trips.form.createFailed);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsOpen(true)}>
        {s.tripButton}
      </button>

      <Modal
        open={isOpen}
        onClose={() => {
          setIsOpen(false);
          setError(null);
        }}
        title={s.tripTitle}
      >
        <form action={handleSubmit} className="d-flex flex-column gap-3">
          <p className="small text-secondary mb-0">{s.tripHint}</p>

          <div>
            <label className="form-label small text-secondary" htmlFor={`${uid}-title`}>
              {t.trips.form.title}
            </label>
            {/* Название сообщества — заготовкой: чаще всего поездка и
                называется по нему, а переписать одно поле дешевле, чем
                придумывать с нуля. */}
            <input
              id={`${uid}-title`}
              type="text"
              name="title"
              required
              autoFocus
              defaultValue={communityTitle}
              placeholder={t.trips.form.titlePlaceholder}
              className="form-control"
            />
          </div>

          <div className="row g-2">
            <div className="col">
              <label className="form-label small text-secondary" htmlFor={`${uid}-startDate`}>
                {t.trips.form.from}
              </label>
              <DatePickerInput id={`${uid}-startDate`} name="startDate" required />
            </div>
            <div className="col">
              <label className="form-label small text-secondary" htmlFor={`${uid}-endDate`}>
                {t.trips.form.to}
              </label>
              <DatePickerInput id={`${uid}-endDate`} name="endDate" required />
            </div>
          </div>

          <div>
            <label className="form-label small text-secondary" htmlFor={`${uid}-memberIds`}>
              {s.tripMembers}
            </label>
            {members.length > 0 ? (
              <EntityMultiSelect
                id={`${uid}-memberIds`}
                name="memberIds"
                options={members}
                placeholder={s.tripMembersPlaceholder}
              />
            ) : (
              // Поездку в одиночку тоже заводим: сообщество может быть
              // ещё пустым, а планы у человека уже есть.
              <p className="small text-secondary mb-0">{s.tripNobody}</p>
            )}
          </div>

          <VisibilityRadios />
          {error && <p className="small text-danger mb-0">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            {isSaving ? t.trips.form.creating : s.tripSubmit}
          </button>
        </form>
      </Modal>
    </>
  );
}
