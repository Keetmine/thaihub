"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import ConfirmForm from "@/components/ConfirmForm";
import DatePickerInput from "@/components/DatePickerInput";
import EntitySelect from "@/components/EntitySelect";
import { useT } from "@/components/LocaleProvider";
import UploadImage from "@/components/UploadImage";
import { uploadErrorMessage } from "@/lib/uploadErrors";
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
  posterUrl: string | null;
  drama: { id: string; name: string } | null;
};

/**
 * Форма встречи сообщества — одна на создание и на правку (АА25).
 *
 * Кнопка + модалка, как у настроек сообщества (`CommunityAdmin`):
 * встречи заводят из вкладки, не уходя с неё.
 *
 * Галочки «показывать всем» тут нет: встречу видят только участники
 * сообщества, и исключений не бывает (правка владельца 2026-09-08) — в
 * «где» у домашней встречи стоит чей-то адрес.
 *
 * Афиша встречи грузится сразу при выборе файла, а не по «Сохранить»:
 * так же сделана обложка сообщества (`CommunityAdmin`) — картинка
 * уезжает на общую ручку /api/upload, а в форме остаётся только её
 * адрес скрытым полем.
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
  // Афиша встречи: адрес держим в состоянии и отдаём форме скрытым
  // полем. Без картинки карточка рисует первую букву названия — как у
  // обычных событий, отдельного «нет постера» не нужно.
  const [posterUrl, setPosterUrl] = useState<string | null>(meetup?.posterUrl ?? null);
  const [posterBusy, setPosterBusy] = useState(false);
  const posterInputRef = useRef<HTMLInputElement>(null);

  async function pickPoster(file: File) {
    setError(null);
    setPosterBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/upload", { method: "POST", body });
      const data = await res.json();
      // Ручка отдаёт код ошибки, а не фразу: языка страницы она не знает.
      if (!res.ok) {
        setError(uploadErrorMessage(t, data, t.widgets.file.failed));
        return;
      }
      setPosterUrl(data.url as string);
    } catch {
      setError(t.widgets.file.failed);
    } finally {
      setPosterBusy(false);
    }
  }

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

          <div className="d-flex flex-column gap-2">
            <span className="form-label small text-secondary mb-0">{s.posterLabel}</span>
            {posterUrl && (
              <div style={{ width: "8rem" }}>
                <UploadImage src={posterUrl} alt="" sizes="8rem" />
              </div>
            )}
            <div className="d-flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={posterBusy}
                onClick={() => posterInputRef.current?.click()}
              >
                {posterBusy ? s.posterUploading : posterUrl ? s.posterReplace : s.posterUpload}
              </button>
              {posterUrl && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm text-danger"
                  disabled={posterBusy}
                  onClick={() => setPosterUrl(null)}
                >
                  {s.posterRemove}
                </button>
              )}
            </div>
            <input
              ref={posterInputRef}
              type="file"
              accept="image/*"
              className="d-none"
              onChange={(e) => {
                const file = e.target.files?.[0];
                // Сбрасываем поле: повторный выбор ТОГО ЖЕ файла иначе не
                // поднимает change.
                e.target.value = "";
                if (file) void pickPoster(file);
              }}
            />
            <input type="hidden" name="posterUrl" value={posterUrl ?? ""} />
          </div>

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
