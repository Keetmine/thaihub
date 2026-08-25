"use client";

import { useState } from "react";
import { saveEventNote } from "./noteActions";
import { PencilIcon } from "@/components/icons";
import { useT } from "@/components/LocaleProvider";

export type FriendNote = {
  id: string;
  text: string;
  userName: string | null;
  userPhotoUrl: string | null;
};

/** Заметки к событию (Г6): своя (редактируемая, личная или «для друзей»)
 *  + заметки друзей с видимостью FRIENDS. */
export default function EventNoteSection({
  eventId,
  ownNote,
  friendNotes,
}: {
  eventId: string;
  ownNote: { text: string; visibility: string } | null;
  friendNotes: FriendNote[];
}) {
  const t = useT();
  const [isEditing, setIsEditing] = useState(false);
  const boundSave = saveEventNote.bind(null, eventId);

  async function handleSave(formData: FormData) {
    await boundSave(formData);
    setIsEditing(false);
  }

  return (
    <div className="surface p-4 mb-3">
      <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
        <h2 className="section-heading mb-0">
          <PencilIcon /> {t.events.notes.heading}
        </h2>
        {!isEditing && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsEditing(true)}>
            {ownNote ? t.common.edit : t.events.notes.add}
          </button>
        )}
      </div>

      {isEditing ? (
        <form action={handleSave} className="d-flex flex-column gap-2">
          <textarea
            name="text"
            rows={3}
            defaultValue={ownNote?.text ?? ""}
            placeholder={t.events.notes.placeholder}
            aria-label={t.events.notes.ariaLabel}
            className="form-control"
            autoFocus
          />
          <div className="d-flex flex-wrap align-items-center gap-3">
            <label className="form-check mb-0 small">
              <input
                type="radio"
                name="visibility"
                value="PERSONAL"
                defaultChecked={(ownNote?.visibility ?? "PERSONAL") === "PERSONAL"}
                className="form-check-input"
              />{" "}
              {t.events.notes.visPersonal}
            </label>
            <label className="form-check mb-0 small">
              <input
                type="radio"
                name="visibility"
                value="FRIENDS"
                defaultChecked={ownNote?.visibility === "FRIENDS"}
                className="form-check-input"
              />{" "}
              {t.events.notes.visFriends}
            </label>
            <label className="form-check mb-0 small">
              <input
                type="radio"
                name="visibility"
                value="TRIP"
                defaultChecked={ownNote?.visibility === "TRIP"}
                className="form-check-input"
              />{" "}
              {t.events.notes.visTrip}
            </label>
            <button type="submit" className="btn btn-primary btn-sm ms-auto">
              {t.common.save}
            </button>
          </div>
          <p className="small text-secondary mb-0">{t.events.notes.emptyDeletes}</p>
        </form>
      ) : ownNote ? (
        <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>
          {ownNote.text}{" "}
          <span className="small text-secondary">
            ·{" "}
            {ownNote.visibility === "FRIENDS"
              ? t.events.notes.markFriends
              : ownNote.visibility === "TRIP"
                ? t.events.notes.markTrip
                : t.events.notes.markPersonal}
          </span>
        </p>
      ) : friendNotes.length === 0 ? (
        <p className="small text-secondary mb-0">{t.events.notes.empty}</p>
      ) : null}

      {friendNotes.length > 0 && (
        <div className="d-flex flex-column gap-2 mt-3">
          {friendNotes.map((n) => (
            <div key={n.id} className="d-flex align-items-start gap-2">
              {n.userPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  loading="lazy"
                  decoding="async"
                  src={n.userPhotoUrl}
                  alt=""
                  className="rounded-circle flex-shrink-0"
                  style={{ width: "1.6rem", height: "1.6rem", objectFit: "cover" }}
                />
              ) : (
                <span
                  className="rounded-circle flex-shrink-0 d-inline-block"
                  style={{ width: "1.6rem", height: "1.6rem", background: "var(--bs-secondary-bg)" }}
                />
              )}
              <p className="small mb-0" style={{ whiteSpace: "pre-wrap" }}>
                <span className="text-secondary">{n.userName || t.events.notes.friend}:</span>{" "}
                {n.text}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
