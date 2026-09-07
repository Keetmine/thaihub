"use client";

import { useId, useRef, useState } from "react";
import Modal from "@/components/Modal";
import ImageCropDialog from "@/components/ImageCropDialog";
import UploadImage from "@/components/UploadImage";
import { createCommunity } from "./actions";
import { useT } from "@/components/LocaleProvider";
import { uploadErrorMessage } from "@/lib/uploadErrors";
import {
  COMMUNITY_COVER_RATIO_H,
  COMMUNITY_COVER_RATIO_W,
  COMMUNITY_LINKS_AT_CREATE_MAX,
} from "@/lib/communities";

/**
 * Кнопка «Создать сообщество» с формой в окне.
 *
 * Форма спрашивает ВСЁ сразу — обложку, название, описание, настройки,
 * место и ссылки (правка владельца 2026-09-09: «при создании сообщества
 * сразу выводим все поля и со странами и с фотками и остальное»). До
 * этого спрашивались три поля, а обложку, страну и ссылки приходилось
 * добавлять потом в «Управлении», и человек о них попросту не узнавал:
 * сообщество заводили и бросали пустым.
 *
 * Обязательным при этом осталось одно название — сообщество заводят на
 * настроении, и пять обязательных полей на входе верно отбивают охоту.
 * Порядок и группировка — те же, что в окне управления
 * (`[id]/CommunityAdmin.tsx`), и подписи те же: два разных набора слов
 * для одних и тех же полей читались бы как два разных места.
 *
 * Обе настройки — кто видит и кого пускать — спрашиваем сразу, а не
 * прячем в «изменить»: это решения, которые задают сообществу смысл, и
 * менять их задним числом неприятно (люди уже вступили).
 */
export default function CreateCommunityButton() {
  const uid = useId();
  const t = useT();
  const s = t.communities;
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");

  // Обложка: файл уезжает на общую ручку сразу при выборе, а форме
  // достаётся только адрес скрытым полем — так же сделаны обложка в
  // управлении и картинка встречи. Сообщества ещё нет, писать адрес
  // некуда, поэтому он просто ждёт сабмита в состоянии.
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [isCoverBusy, setIsCoverBusy] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Ссылок при создании может быть несколько, но ряды показываем по
  // мере надобности: пять пустых пар полей в окне выглядят как
  // требование их заполнить.
  //
  // Значения держим в состоянии, а не в неуправляемых полях: ряд можно
  // убрать (жалоба владельца 2026-09-09 «накликал десять, а удалить
  // нельзя»), и после удаления неуправляемые поля сдвинули бы чужой
  // текст на освободившееся место. Ключ у ряда свой, не индекс, по той
  // же причине.
  const [linkRows, setLinkRows] = useState<{ key: number; label: string; url: string }[]>([
    { key: 0, label: "", url: "" },
  ]);
  const nextLinkKey = useRef(1);

  function addLinkRow() {
    setLinkRows((rows) => [...rows, { key: nextLinkKey.current++, label: "", url: "" }]);
  }

  function editLinkRow(key: number, patch: { label?: string; url?: string }) {
    setLinkRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeLinkRow(key: number) {
    setLinkRows((rows) => rows.filter((row) => row.key !== key));
  }

  async function uploadCover(file: File) {
    setError(null);
    setIsCoverBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/upload", { method: "POST", body });
      const data = await res.json();
      // Ручка отдаёт код ошибки, а не фразу — язык страницы ей недоступен.
      if (!res.ok) {
        setError(uploadErrorMessage(t, data, t.widgets.file.failed));
        return;
      }
      setCoverUrl(data.url as string);
    } catch {
      setError(t.widgets.file.failed);
    } finally {
      setIsCoverBusy(false);
    }
  }

  async function handleSubmit(formData: FormData) {
    // Картинка ещё едет — сообщество сохранилось бы без обложки и молча
    // (та же ловушка, что у картинки встречи): в форме сейчас пустой
    // coverUrl. Кнопка на это время отключена, но Enter в текстовом поле
    // отправляет форму мимо неё.
    if (isCoverBusy) {
      setError(s.cover.wait);
      return;
    }
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
        <form action={handleSubmit} className="d-flex flex-column gap-4">
          <div className="d-flex flex-column gap-3">
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
          </div>

          {/* Обложка — ПОД описанием (правка владельца 2026-09-09):
              сообщество начинают заводить со слов, а не с картинки, и
              окно, открывающееся кнопкой загрузки, спрашивает не с того.
              Выше кнопки «Создать» она остаётся с запасом: пока человек
              дописывает остальное, файл успевает уехать, и запрет сабмита
              на время загрузки никого не задерживает. */}
          <div className="d-flex flex-column gap-2">
            <h3 className="section-heading mb-0">{s.cover.title}</h3>
            {coverUrl && (
              <div className="community-cover" style={{ maxWidth: "18rem" }}>
                <UploadImage src={coverUrl} alt="" sizes="18rem" />
              </div>
            )}
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
                  onClick={() => setCoverUrl(null)}
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
                  setError(null);
                  setCropFile(file);
                }
              }}
            />
            <input type="hidden" name="coverUrl" value={coverUrl ?? ""} />
          </div>

          <div className="d-flex flex-column gap-3">
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
          </div>

          {/* Место — просто два поля, без заголовка и пояснения (правка
              владельца 2026-09-09): «Страна» и «Город» с примерами в
              плейсхолдерах понятны сами, а абзац про витрину и фильтр
              объяснял устройство сайта тому, кто просто заводит
              сообщество. Так же теперь и в управлении. */}
          <div className="d-flex flex-column gap-2">
            <div className="row g-2">
              <div className="col-6">
                <label className="form-label small text-secondary" htmlFor={`${uid}-country`}>
                  {s.topics.countryLabel}
                </label>
                <input
                  id={`${uid}-country`}
                  type="text"
                  name="country"
                  maxLength={60}
                  placeholder={s.topics.countryPlaceholder}
                  className="form-control"
                />
              </div>
              <div className="col-6">
                <label className="form-label small text-secondary" htmlFor={`${uid}-city`}>
                  {s.topics.cityLabel}
                </label>
                <input
                  id={`${uid}-city`}
                  type="text"
                  name="city"
                  maxLength={60}
                  placeholder={s.topics.cityPlaceholder}
                  className="form-control"
                />
              </div>
            </div>
          </div>

          {/* Ссылки — рядами полей, а не отдельной формой, как в
              управлении: сообщества ещё нет, добавлять ссылку некуда, и
              обе строки уезжают вместе с остальным по «Создать». */}
          <div className="d-flex flex-column gap-2">
            <h3 className="section-heading mb-0">{s.linksTitle}</h3>
            {linkRows.map((row) => (
              <div key={row.key} className="d-flex flex-wrap gap-2 align-items-end">
                <input
                  type="text"
                  name="linkLabel"
                  maxLength={60}
                  value={row.label}
                  onChange={(e) => editLinkRow(row.key, { label: e.target.value })}
                  placeholder={s.linkLabel}
                  aria-label={s.linkLabel}
                  className="form-control form-control-sm"
                  style={{ maxWidth: "10rem" }}
                />
                <input
                  type="url"
                  name="linkUrl"
                  value={row.url}
                  onChange={(e) => editLinkRow(row.key, { url: e.target.value })}
                  placeholder="https://t.me/…"
                  aria-label={s.linkUrl}
                  className="form-control form-control-sm"
                  style={{ maxWidth: "14rem" }}
                />
                {/* «Убрать ссылку» — та же кнопка и та же подпись, что у
                    готовой ссылки в управлении: вещь одна, и второго
                    способа её убрать быть не должно. */}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => removeLinkRow(row.key)}
                >
                  {s.deleteLink}
                </button>
              </div>
            ))}
            {linkRows.length < COMMUNITY_LINKS_AT_CREATE_MAX && (
              <div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={addLinkRow}>
                  {s.addLink}
                </button>
              </div>
            )}
          </div>

          {error && <p className="small text-danger mb-0">{error}</p>}
          <div>
            <button type="submit" className="btn btn-primary" disabled={isSaving || isCoverBusy}>
              {s.create}
            </button>
          </div>
        </form>
      </Modal>

      {/* Окно кадрирования — СНАРУЖИ окна создания: два модальных окна
          друг в друге закрываются одним Esc, и отмена кропа унесла бы с
          собой всю форму. */}
      {cropFile && (
        <ImageCropDialog
          file={cropFile}
          ratioW={COMMUNITY_COVER_RATIO_W}
          ratioH={COMMUNITY_COVER_RATIO_H}
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
