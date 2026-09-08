"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import FileDropzone from "@/components/FileDropzone";
import ConfirmForm from "@/components/ConfirmForm";
import { useT } from "@/components/LocaleProvider";
import {
  addCommunityLink,
  deleteCommunity,
  deleteCommunityLink,
  updateCommunity,
} from "../actions";
import { loadCommunityCover, setCommunityCover } from "../coverActions";
import {
  loadCommunityPlace,
  saveCommunityPlace,
  type CommunityPlaceState,
} from "../whereActions";
// Пропорции обложки — общей константой: рамка кадрирования обязана
// показывать то, что окажется на странице, а форма создания и форма
// правки должны кадрировать ОДИНАКОВО.
import { COMMUNITY_COVER_RATIO_H, COMMUNITY_COVER_RATIO_W } from "@/lib/communities";

/** Загруженное место — только успешная ветка ответа экшена: ошибку окно
 *  показывает отдельной строкой, а не подставляет в поля. */
type LoadedPlace = Extract<CommunityPlaceState, { ok: true }>;

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
  // Пока адрес обложки пишется в базу — блокировать нечего: сама
  // загрузка файла живёт в дропзоне, а запись идёт мгновенно.

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

  // ---------- Привязки к каталогу и место ----------
  // Текущий набор приезжает при открытии окна, как и обложка: страница
  // сообщества его в пропсах не передаёт, а комбобокс обязан показать
  // ИМЕНА уже выбранных, а не голые id.
  const [topics, setTopics] = useState<LoadedPlace | null>(null);
  const [topicsError, setTopicsError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let dropped = false;
    loadCommunityPlace(communityId).then((result) => {
      if (dropped || !result.ok) return;
      setTopics(result);
    });
    return () => {
      dropped = true;
    };
  }, [communityId, isOpen]);

  async function saveTopics(formData: FormData) {
    setTopicsError(null);
    const result = await saveCommunityPlace(communityId, formData);
    if (!result.ok) {
      setTopicsError(result.error);
      return;
    }
    setIsOpen(false);
    router.refresh();
  }

  /** Адрес загруженной картинки — в базу. Файл на общую ручку уже
   *  отправила дропзона; порядок именно такой: пока обложка не
   *  записана, файл просто лежит на диске сиротой, а запись адреса до
   *  загрузки дала бы битую картинку на публичной странице.
   *  Пустая строка означает «убрали обложку». */
  async function saveCover(url: string) {
    setCoverError(null);
    try {
      const saved = await setCommunityCover(communityId, url || null);
      if (!saved.ok) {
        setCoverError(saved.error);
        return;
      }
      setCoverUrl(saved.coverUrl);
      router.refresh();
    } catch {
      setCoverError(t.widgets.file.failed);
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
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            // Привязки сбрасываем на открытии: комбобоксы читают
            // выбранное ОДИН раз, при монтировании, и прошлый набор в
            // состоянии показал бы во второй раз то, что было ДО
            // сохранения. Загрузит их эффект ниже.
            setTopics(null);
            setIsOpen(true);
          }}
        >
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
              (см. coverActions.ts). Поле — общая дропзона, как во всех
              формах админки (правка владельца 2026-09-09): своя кнопка
              со своей загрузкой была вторым видом у одной и той же вещи.
              Ни заголовка, ни пояснения над рамкой нет — что это
              картинка, видно по самой рамке. */}
          <div className="d-flex flex-column gap-2">
            <FileDropzone
              name="coverUrl"
              label={s.coverLabel}
              defaultValue={coverUrl ?? ""}
              wide
              crop
              ratioW={COMMUNITY_COVER_RATIO_W}
              ratioH={COMMUNITY_COVER_RATIO_H}
              onUrlChange={saveCover}
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

          {/* Привязки к каталогу и место — отдельной формой, не полями
              формы настроек: их набор приезжает асинхронно (см. выше), и
              «Сохранить» у настроек затирал бы ещё не приехавшее.
              Смысл двух блоков разный: привязки — то, ЧЕМ сообщество
              находят в каталоге, место — то, ГДЕ оно живёт; см.
              docs/features/communities.md. */}
          {topics ? (
            <form action={saveTopics} className="d-flex flex-column gap-3">
              {/* Заголовка и пояснения над полями нет (правка владельца
                  2026-09-09): «Страна» и «Город» с примерами в
                  плейсхолдерах понятны сами, а абзац про витрину и фильтр
                  объяснял устройство сайта тому, кто просто правит своё
                  сообщество. Так же и в форме создания. */}
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
                    defaultValue={topics.country}
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
                    defaultValue={topics.city}
                    placeholder={s.topics.cityPlaceholder}
                    className="form-control"
                  />
                </div>
              </div>

              {topicsError && <p className="small text-danger mb-0">{topicsError}</p>}
              <button type="submit" className="btn btn-primary btn-sm">
                {s.topics.save}
              </button>
            </form>
          ) : (
            <p className="small text-secondary mb-0">{s.topics.loading}</p>
          )}

          {/* Ссылки — отдельной формой: они добавляются по одной, и
              перезаписывать вместе с названием их незачем. */}
          <div className="d-flex flex-column gap-2">
            <h3 className="section-heading mb-0">{s.linksTitle}</h3>
            {links.map((l) => (
              <div key={l.id} className="d-flex align-items-center justify-content-between gap-2">
                <span className="small text-truncate">{l.label}</span>
                {/* Крестик, как в форме создания: подписанная «Убрать
                    ссылку» весила больше самой строки, а два вида у
                    одного действия читались как два разных действия.
                    Что делает крестик, говорит подсказка по наведению. */}
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={s.deleteLink}
                  data-tooltip={s.deleteLink}
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      await deleteCommunityLink(communityId, l.id);
                      router.refresh();
                    })
                  }
                >
                  ×
                </button>
              </div>
            ))}
            <form action={addLink} className="d-flex flex-wrap gap-2 align-items-end">
              {/* aria-label, как у тех же полей в форме создания: видимой
                  подписи у них нет, а плейсхолдер именем поля служит не
                  во всех читалках. */}
              <input
                type="text"
                name="label"
                required
                maxLength={60}
                placeholder={s.linkLabel}
                aria-label={s.linkLabel}
                className="form-control form-control-sm"
                style={{ maxWidth: "10rem" }}
              />
              <input
                type="url"
                name="url"
                required
                placeholder="https://t.me/…"
                aria-label={s.linkUrl}
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

    </>
  );
}
