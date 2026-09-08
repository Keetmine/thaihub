"use client";

import { useId, useRef, useState } from "react";
import Modal from "@/components/Modal";
import FileDropzone from "@/components/FileDropzone";
import { createCommunity } from "./actions";
import { useT } from "@/components/LocaleProvider";
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
  //
  // Пока файл едет, сабмит закрыт (onUploadingChange у дропзоны): адрес
  // попадает в скрытое поле только ПОСЛЕ загрузки, и ранний «Создать»
  // молча завёл бы сообщество без обложки — как это уже случалось со
  // встречами (жалоба владельца 2026-09-08 «фото не загружается»).
  const [isCoverUploading, setIsCoverUploading] = useState(false);

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

  async function handleSubmit(formData: FormData) {
    // Дубль запрета с кнопки: Enter в любом текстовом поле отправляет
    // форму мимо неё, и disabled его не останавливает.
    if (isCoverUploading) return;
    setIsSaving(true);
    setError(null);
    try {
      // При успехе экшен уводит redirect'ом — сюда возвращается только
      // ошибка валидации.
      const result = await createCommunity(formData);
      if (result) setError(result.error);
    } catch {
      // Сюда попадает сеть/сервер, а не валидация — конкретную причину
      // мы не знаем, поэтому фраза общая (раньше тут стояло «Укажите
      // название», и на оборванную сеть человек шёл чинить название).
      setError(t.widgets.errors.network);
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
          {/* Обычное поле загрузки, как во всех формах админки (правка
              владельца 2026-09-09): своя кнопка «Добавить обложку» со
              своей загрузкой была вторым видом у одной и той же вещи.
              Заголовка и пояснения над рамкой тоже нет — что это
              картинка, видно по самой рамке. Кадрируем квадратом, как
              обложка и показывается. */}
          <FileDropzone
            name="coverUrl"
            label={s.coverLabel}
            defaultValue=""
            wide
            crop
            ratioW={COMMUNITY_COVER_RATIO_W}
            ratioH={COMMUNITY_COVER_RATIO_H}
            onUploadingChange={setIsCoverUploading}
          />

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
                {/* Крестик в том же ряду, а не подписанная кнопка
                    (правка владельца 2026-09-09): «Убрать ссылку»
                    словами весила больше самих полей и перетягивала на
                    себя весь ряд. Что делает крестик, говорит подсказка
                    по наведению — как у остальных иконок сайта. */}
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={s.deleteLink}
                  data-tooltip={s.deleteLink}
                  onClick={() => removeLinkRow(row.key)}
                >
                  ×
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
            <button type="submit" className="btn btn-primary" disabled={isSaving || isCoverUploading}>
              {s.create}
            </button>
          </div>
        </form>
      </Modal>

    </>
  );
}
