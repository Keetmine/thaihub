"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import ConfirmForm from "@/components/ConfirmForm";
import { useT } from "@/components/LocaleProvider";
import {
  addCommunityLink,
  deleteCommunity,
  deleteCommunityLink,
  updateCommunity,
} from "../actions";

/**
 * Управление сообществом — для владельца и модераторов: правка
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
    </>
  );
}
