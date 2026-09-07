"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import ConfirmForm from "@/components/ConfirmForm";
import DatePickerInput from "@/components/DatePickerInput";
import EntitySelect from "@/components/EntitySelect";
import { useT } from "@/components/LocaleProvider";
import { createMeetup, deleteMeetup, searchMeetupDramas, updateMeetup } from "../eventActions";

export type MeetupFormValues = {
  id: string;
  title: string;
  venue: string;
  address: string | null;
  description: string | null;
  /** Дата и время приходят готовыми строками с сервера: собирать их из
   *  Date в браузере нельзя — у зрителя своя зона, и «19:00 в Бангкоке»
   *  превратилось бы в 15:00. */
  dateKey: string;
  timeValue: string;
  communityOnly: boolean;
  drama: { id: string; name: string } | null;
};

/**
 * Форма встречи сообщества — одна на создание и на правку (АА25).
 *
 * Кнопка + модалка, как у настроек сообщества (`CommunityAdmin`):
 * встречи заводят из вкладки, не уходя с неё.
 *
 * Главное поле формы — галочка «показывать всем». Она снята по
 * умолчанию, и это не оформительское решение: в «где» у домашней
 * встречи стоит чей-то адрес, и попасть в общую афишу он может только
 * осознанным жестом автора.
 */
export default function MeetupForm({
  communityId,
  meetup,
  canDelete = false,
}: {
  communityId: string;
  /** Есть — правим эту встречу, нет — заводим новую. */
  meetup?: MeetupFormValues;
  canDelete?: boolean;
}) {
  const uid = useId();
  const t = useT();
  const s = t.communities.meetups;
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function save(formData: FormData) {
    setError(null);
    setIsSaving(true);
    try {
      const result = meetup
        ? await updateMeetup(meetup.id, formData)
        : await createMeetup(communityId, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setIsOpen(false);
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  // Удаление — через общий ConfirmForm, но с своей обёрткой: после
  // успеха надо закрыть модалку и обновить вкладку.
  async function handleDelete() {
    if (!meetup) return;
    const result = await deleteMeetup(meetup.id);
    if (!result.ok) return { error: result.error };
    setIsOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        className={meetup ? "btn btn-ghost btn-sm" : "btn btn-primary btn-sm"}
        onClick={() => setIsOpen(true)}
      >
        {meetup ? t.communities.edit : s.create}
      </button>

      <Modal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title={meetup ? s.editTitle : s.createTitle}
      >
        <form action={save} className="d-flex flex-column gap-3">
          <div>
            <label className="form-label small text-secondary" htmlFor={`${uid}-title`}>
              {s.titleLabel}
            </label>
            <input
              id={`${uid}-title`}
              type="text"
              name="title"
              required
              maxLength={120}
              defaultValue={meetup?.title}
              placeholder={s.titlePlaceholder}
              className="form-control"
            />
          </div>

          <div className="row g-2">
            <div className="col-7">
              <label className="form-label small text-secondary" htmlFor={`${uid}-date`}>
                {s.dateLabel}
              </label>
              <DatePickerInput
                id={`${uid}-date`}
                name="date"
                required
                defaultValue={meetup?.dateKey}
              />
            </div>
            <div className="col-5">
              <label className="form-label small text-secondary" htmlFor={`${uid}-time`}>
                {s.timeLabel}
              </label>
              <input
                id={`${uid}-time`}
                type="time"
                name="time"
                defaultValue={meetup?.timeValue}
                className="form-control"
              />
              <p className="small text-secondary mb-0" style={{ opacity: 0.75 }}>
                {s.timeHint}
              </p>
            </div>
          </div>

          <div>
            <label className="form-label small text-secondary" htmlFor={`${uid}-venue`}>
              {s.venueLabel}
            </label>
            <input
              id={`${uid}-venue`}
              type="text"
              name="venue"
              required
              maxLength={120}
              defaultValue={meetup?.venue}
              placeholder={s.venuePlaceholder}
              className="form-control"
            />
          </div>

          <div>
            <label className="form-label small text-secondary" htmlFor={`${uid}-address`}>
              {s.addressLabel}
            </label>
            <input
              id={`${uid}-address`}
              type="text"
              name="address"
              maxLength={200}
              defaultValue={meetup?.address ?? ""}
              placeholder={s.addressPlaceholder}
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
              defaultValue={meetup?.description ?? ""}
              placeholder={s.descriptionPlaceholder}
              className="form-control"
            />
          </div>

          {/* Каталог сериалов пропсом не приезжает (их тысячи) — общий
              комбобокс ищет на сервере по мере ввода, как выбор артистов
              в личных событиях поездки. Уже привязанный приходит
              options'ом, чтобы название показалось сразу. */}
          <EntitySelect
            name="dramaId"
            label={s.dramaLabel}
            options={meetup?.drama ? [meetup.drama] : []}
            defaultValue={meetup?.drama?.id}
            placeholder={s.dramaNone}
            searchOptions={searchMeetupDramas}
          />

          <fieldset>
            <legend className="form-label small text-secondary">{s.visibilityLabel}</legend>
            <label className="form-check d-flex align-items-center gap-2 mb-1">
              <input
                type="checkbox"
                name="openToEveryone"
                defaultChecked={meetup ? !meetup.communityOnly : false}
                className="form-check-input m-0"
              />
              <span className="form-check-label small">{s.openToEveryone}</span>
            </label>
            <p className="small text-secondary mb-0" style={{ opacity: 0.75 }}>
              {s.openHint}
            </p>
          </fieldset>

          {error && <p className="small text-danger mb-0">{error}</p>}

          <div className="d-flex flex-wrap gap-2 align-items-center">
            <button type="submit" className="btn btn-primary btn-sm" disabled={isSaving}>
              {s.save}
            </button>
            {meetup && canDelete && (
              <ConfirmForm
                action={handleDelete}
                confirmMessage={s.deleteConfirm}
                confirmLabel={s.delete}
              >
                <button type="button" className="btn btn-ghost btn-sm text-danger">
                  {s.delete}
                </button>
              </ConfirmForm>
            )}
          </div>
        </form>
      </Modal>
    </>
  );
}
