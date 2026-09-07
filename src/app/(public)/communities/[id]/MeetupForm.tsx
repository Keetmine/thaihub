"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { PencilIcon } from "@/components/icons";
import FileDropzone from "@/components/FileDropzone";
import ConfirmForm from "@/components/ConfirmForm";
import DatePickerInput from "@/components/DatePickerInput";
import TimeInput from "@/components/TimeInput";
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
 * Картинка встречи грузится сразу при выборе файла, а не по «Сохранить»:
 * так же сделана обложка сообщества (`CommunityAdmin`) — картинка
 * уезжает на общую ручку /api/upload, а в форме остаётся только её
 * адрес скрытым полем.
 *
 * Отсюда же и запрет сохранять, пока файл ещё едет (жалоба владельца
 * 2026-09-08 «фото не загружается»): фотография с телефона уезжает на
 * сервер и переживает пережатие в WebP несколько секунд, а кто нажимал
 * «Сохранить», не дождавшись, отправлял форму с ПУСТЫМ `posterUrl` —
 * встреча сохранялась без картинки и молча, без единой ошибки. Поэтому
 * сабмит на время загрузки закрыт и кнопкой, и проверкой в самом
 * обработчике (форму отправляет ещё и Enter в любом текстовом поле,
 * мимо кнопки). Поле картинки с тех пор переехало наверх, сразу под
 * название (правка владельца 2026-09-08), — от этого гонка стала реже,
 * но не исчезла: запрет остаётся на месте.
 */
export default function MeetupForm({
  communityId,
  meetup,
  canDelete = false,
  compact = false,
}: {
  communityId: string;
  /** Есть — правим эту встречу, нет — заводим новую. */
  meetup?: MeetupFormValues;
  canDelete?: boolean;
  /** Иконка-карандаш вместо подписанной кнопки — для угла карточки в
   *  списке встреч (правка владельца 2026-09-09). Ровно тот же приём и
   *  та же причина, что у правки темы обсуждения (`PostEditForm`): в
   *  ряду значков подпись была бы единственным словом. */
  compact?: boolean;
}) {
  const uid = useId();
  const t = useT();
  const s = t.communities.meetups;
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [posterKey, setPosterKey] = useState(0);
  // Картинка встречи: адрес держим в состоянии и отдаём форме скрытым
  // полем. Без картинки карточка рисует первую букву названия — как у
  // обычных событий, отдельного «нет постера» не нужно.
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
      // Новая встреча заведена — чистим картинку за собой: форма создания
      // живёт в шапке вкладки и не размонтируется, и следующая встреча
      // уехала бы с картинкой предыдущей.
      // Новую дропзону пересоздаём ключом: своё состояние она держит
      // внутри, и без этого следующая встреча уехала бы с картинкой
      // предыдущей (тот же приём у формы темы — см. PostForm).
      if (!meetup) setPosterKey((n) => n + 1);
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
      {compact ? (
        <button
          type="button"
          className="icon-btn"
          aria-label={t.communities.edit}
          data-tooltip={t.communities.edit}
          onClick={() => setIsOpen(true)}
        >
          <PencilIcon />
        </button>
      ) : (
        <button
          type="button"
          className={meetup ? "btn btn-ghost btn-sm" : "btn btn-primary btn-sm"}
          onClick={() => setIsOpen(true)}
        >
          {meetup ? t.communities.edit : s.create}
        </button>
      )}

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

          {/* Картинка — СРАЗУ после названия (правка владельца
              2026-09-08). Внизу формы её не замечали, а слово «Афиша»
              над ней читалось как «список событий», а не «картинка для
              карточки». Заодно у файла появляется фора: пока автор
              заполняет дату, место и подробности, загрузка успевает
              закончиться — и запрет сабмита ниже никого не задерживает.
              Сам запрет остаётся: заполнить остальное можно и за секунду,
              а Enter отправляет форму мимо кнопки. */}
          {/* Обычное поле загрузки, как во всех формах админки (правка
              владельца 2026-09-09): раньше тут была кнопка «Добавить
              картинку» со своей загрузкой — второй вид у одной и той же
              вещи. Подпись владелец попросила вернуть: поле стоит первым
              в форме, и без неё непонятно, картинка чего это. Рамка —
              полосой во всю ширину и низкая: окно узкое. */}
          <FileDropzone
            key={posterKey}
            name="posterUrl"
            label={s.posterLabel}
            defaultValue={meetup?.posterUrl ?? ""}
            wide
          />

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
              {/* Своё поле, а не type="time" (правка владельца
                  2026-09-09): нативное пустое поле браузер рисовал как
                  «12:30», и стереть эту подпись было нельзя. Подписи
                  «оставьте пустым» тут тоже нет — пустое поле и так
                  выглядит пустым. */}
              <TimeInput id={`${uid}-time`} name="time" defaultValue={meetup?.timeValue ?? ""} />
            </div>
          </div>

          {/* Одно поле вместо «Где» и «Адрес» (правка владельца
              2026-09-09: «чем они отличаются? оставим один Адрес»). Их и
              правда было не различить: обе строки показывались рядом
              через точку на странице встречи.
              У встречи, заведённой ещё двумя полями, значения склеиваем
              в одно — иначе адрес остался бы в базе, но правкой его было
              бы не достать. */}
          <div>
            <label className="form-label small text-secondary" htmlFor={`${uid}-venue`}>
              {s.addressLabel}
            </label>
            <input
              id={`${uid}-venue`}
              type="text"
              name="venue"
              required
              maxLength={200}
              defaultValue={[meetup?.venue, meetup?.address].filter(Boolean).join(", ")}
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

          {error && <p className="small text-danger mb-0">{error}</p>}

          <div className="d-flex flex-wrap gap-2 align-items-center">
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={isSaving}
            >
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
