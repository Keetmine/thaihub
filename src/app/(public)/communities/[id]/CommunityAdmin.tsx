"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import ConfirmForm from "@/components/ConfirmForm";
import ImageCropDialog from "@/components/ImageCropDialog";
import UploadImage from "@/components/UploadImage";
import { useT } from "@/components/LocaleProvider";
import { uploadErrorMessage } from "@/lib/uploadErrors";
import {
  addCommunityLink,
  deleteCommunity,
  deleteCommunityLink,
  updateCommunity,
} from "../actions";
import { loadCommunityCover, setCommunityCover } from "../coverActions";

/** Пропорции обложки — те же, в которых она и рисуется в колонке
 *  сообщества (`.community-cover`, 3:2). Кадрируем ровно в них: рамка
 *  обязана показывать то, что окажется на странице. */
const COVER_RATIO_W = 3;
const COVER_RATIO_H = 2;

/**
 * Управление сообществом — для владельца и модераторов: обложка, правка
 * названия и описания, ссылки, удаление.
 *
 * Видимость и правила вступления меняет только владелец, поэтому их
 * поля в форме появляются лишь у него (сервер проверяет это ещё раз —
 * форму можно отправить и мимо интерфейса).
 */
export default function CommunityAdmin({
  communityId,
  isOwner,
  community,
  links,
}: {
  communityId: string;
  isOwner: boolean;
  community: {
    title: string;
    description: string | null;
    visibility: "PUBLIC" | "PRIVATE";
    joinMode: "OPEN" | "APPROVAL";
  };
  links: { id: string; label: string; url: string }[];
}) {
  const uid = useId();
  const t = useT();
  const s = t.communities;
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // ---------- Обложка ----------
  // Страница сообщества обложку сюда не передаёт, поэтому окно берёт её
  // само при открытии: без текущего адреса нечего показать в
  // предпросмотре и не понять, есть ли что убирать.
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [isCoverBusy, setIsCoverBusy] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    let dropped = false;
    loadCommunityCover(communityId).then((result) => {
      if (dropped || !result.ok) return;
      setCoverUrl(result.coverUrl);
    });
    return () => {
      dropped = true;
    };
  }, [communityId, isOpen]);

  /** Кадрированный файл — на общую ручку загрузки, её адрес — в базу.
   *  Порядок именно такой: пока обложка не записана, файл на диске
   *  просто лежит сиротой, а вот запись адреса до загрузки дала бы
   *  битую картинку на публичной странице. */
  async function uploadCover(file: File) {
    setCoverError(null);
    setIsCoverBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/upload", { method: "POST", body });
      const data = await res.json();
      // Ручка отдаёт код ошибки, а не фразу — язык страницы ей недоступен.
      if (!res.ok) {
        setCoverError(uploadErrorMessage(t, data, t.widgets.file.failed));
        return;
      }
      const saved = await setCommunityCover(communityId, data.url);
      if (!saved.ok) {
        setCoverError(saved.error);
        return;
      }
      setCoverUrl(saved.coverUrl);
      router.refresh();
    } catch {
      setCoverError(t.widgets.file.failed);
    } finally {
      setIsCoverBusy(false);
    }
  }

  async function removeCover() {
    setCoverError(null);
    setIsCoverBusy(true);
    try {
      const saved = await setCommunityCover(communityId, null);
      if (!saved.ok) {
        setCoverError(saved.error);
        return;
      }
      setCoverUrl(null);
      router.refresh();
    } finally {
      setIsCoverBusy(false);
    }
  }

  async function saveSettings(formData: FormData) {
    setError(null);
    const result = await updateCommunity(communityId, formData);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setIsOpen(false);
    router.refresh();
  }

  async function addLink(formData: FormData) {
    setError(null);
    const result = await addCommunityLink(communityId, formData);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <>
      <div className="d-flex flex-wrap gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsOpen(true)}>
          {s.edit}
        </button>
        {isOwner && (
          <ConfirmForm
            action={deleteCommunity.bind(null, communityId)}
            confirmMessage={s.deleteConfirm}
            confirmLabel={s.delete}
          >
            <button type="button" className="btn btn-ghost btn-sm text-danger">
              {s.delete}
            </button>
          </ConfirmForm>
        )}
      </div>

      <Modal open={isOpen} onClose={() => setIsOpen(false)} title={s.edit}>
        <div className="d-flex flex-column gap-4">
          {/* Обложка — отдельным блоком, не полем формы: она уезжает на
              сервер сразу после кадрирования, а не по «Сохранить»
              (см. coverActions.ts). */}
          <div className="d-flex flex-column gap-2">
            <h3 className="section-heading mb-0">{s.cover.title}</h3>
            <div className="community-cover" style={{ maxWidth: "18rem" }}>
              {coverUrl && <UploadImage src={coverUrl} alt="" sizes="18rem" />}
            </div>
            <p className="small text-secondary mb-0">{s.cover.hint}</p>
            <div className="d-flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={isCoverBusy}
                onClick={() => fileRef.current?.click()}
              >
                {isCoverBusy ? s.cover.uploading : coverUrl ? s.cover.replace : s.cover.upload}
              </button>
              {coverUrl && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm text-danger"
                  disabled={isCoverBusy}
                  onClick={removeCover}
                >
                  {s.cover.remove}
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="d-none"
              onChange={(e) => {
                const file = e.target.files?.[0];
                // Сбрасываем поле: иначе повторный выбор ТОГО ЖЕ файла
                // (отменил кадрирование — передумал) не поднимает change.
                e.target.value = "";
                if (file) {
                  setCoverError(null);
                  setCropFile(file);
                }
              }}
            />
            {coverError && <p className="small text-danger mb-0">{coverError}</p>}
          </div>

          <form action={saveSettings} className="d-flex flex-column gap-3">
            <div>
              <label className="form-label small text-secondary" htmlFor={`${uid}-title`}>
                {s.titleLabel}
              </label>
              <input
                id={`${uid}-title`}
                type="text"
                name="title"
                required
                maxLength={80}
                defaultValue={community.title}
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
                defaultValue={community.description ?? ""}
                className="form-control"
              />
            </div>

            {isOwner && (
              <>
                <fieldset>
                  <legend className="form-label small text-secondary">{s.visibilityLabel}</legend>
                  {(["PUBLIC", "PRIVATE"] as const).map((value) => (
                    <label key={value} className="form-check small mb-0">
                      <input
                        type="radio"
                        name="visibility"
                        value={value}
                        defaultChecked={community.visibility === value}
                        className="form-check-input"
                      />{" "}
                      {s.visibility[value]}
                    </label>
                  ))}
                </fieldset>
                <fieldset>
                  <legend className="form-label small text-secondary">{s.joinModeLabel}</legend>
                  {(["OPEN", "APPROVAL"] as const).map((value) => (
                    <label key={value} className="form-check small mb-0">
                      <input
                        type="radio"
                        name="joinMode"
                        value={value}
                        defaultChecked={community.joinMode === value}
                        className="form-check-input"
                      />{" "}
                      {s.joinMode[value]}
                    </label>
                  ))}
                </fieldset>
              </>
            )}

            <button type="submit" className="btn btn-primary btn-sm" disabled={isPending}>
              {s.save}
            </button>
          </form>

          {/* Ссылки — отдельной формой: они добавляются по одной, и
              перезаписывать вместе с названием их незачем. */}
          <div className="d-flex flex-column gap-2">
            <h3 className="section-heading mb-0">{s.linksTitle}</h3>
            {links.map((l) => (
              <div key={l.id} className="d-flex align-items-center justify-content-between gap-2">
                <span className="small text-truncate">{l.label}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      await deleteCommunityLink(communityId, l.id);
                      router.refresh();
                    })
                  }
                >
                  {s.deleteLink}
                </button>
              </div>
            ))}
            <form action={addLink} className="d-flex flex-wrap gap-2 align-items-end">
              <input
                type="text"
                name="label"
                required
                maxLength={60}
                placeholder={s.linkLabel}
                className="form-control form-control-sm"
                style={{ maxWidth: "10rem" }}
              />
              <input
                type="url"
                name="url"
                required
                placeholder="https://t.me/…"
                className="form-control form-control-sm"
                style={{ maxWidth: "14rem" }}
              />
              <button type="submit" className="btn btn-ghost btn-sm">
                {s.addLink}
              </button>
            </form>
          </div>

          {error && <p className="small text-danger mb-0">{error}</p>}
        </div>
      </Modal>

      {/* Окно кадрирования — СНАРУЖИ окна правки: два модальных окна
          друг в друге закрываются одним Esc, и отмена кропа уносила бы
          с собой всю форму. */}
      {cropFile && (
        <ImageCropDialog
          file={cropFile}
          ratioW={COVER_RATIO_W}
          ratioH={COVER_RATIO_H}
          stageMaxWidth="20rem"
          onCancel={() => setCropFile(null)}
          onDone={(cropped) => {
            setCropFile(null);
            uploadCover(cropped);
          }}
        />
      )}
    </>
  );
}
