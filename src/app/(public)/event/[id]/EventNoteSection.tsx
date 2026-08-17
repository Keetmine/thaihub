"use client";

import { useState } from "react";
import { saveEventNote } from "./noteActions";
import { PencilIcon } from "@/components/icons";

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
          <PencilIcon /> Заметки
        </h2>
        {!isEditing && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsEditing(true)}>
            {ownNote ? "Редактировать" : "+ Добавить заметку"}
          </button>
        )}
      </div>

      {isEditing ? (
        <form action={handleSave} className="d-flex flex-column gap-2">
          <textarea
            name="text"
            rows={3}
            defaultValue={ownNote?.text ?? ""}
            placeholder="Например: берём мерч на входе, встречаемся у гейта 3…"
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
              Личная
            </label>
            <label className="form-check mb-0 small">
              <input
                type="radio"
                name="visibility"
                value="FRIENDS"
                defaultChecked={ownNote?.visibility === "FRIENDS"}
                className="form-check-input"
              />{" "}
              Видна друзьям
            </label>
            <label className="form-check mb-0 small">
              <input
                type="radio"
                name="visibility"
                value="TRIP"
                defaultChecked={ownNote?.visibility === "TRIP"}
                className="form-check-input"
              />{" "}
              Участникам моих поездок
            </label>
            <button type="submit" className="btn btn-primary btn-sm ms-auto">
              Сохранить
            </button>
          </div>
          <p className="small text-secondary mb-0">Пустой текст удаляет заметку.</p>
        </form>
      ) : ownNote ? (
        <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>
          {ownNote.text}{" "}
          <span className="small text-secondary">
            ·{" "}
            {ownNote.visibility === "FRIENDS"
              ? "видна друзьям"
              : ownNote.visibility === "TRIP"
                ? "видна участникам поездок"
                : "личная"}
          </span>
        </p>
      ) : friendNotes.length === 0 ? (
        <p className="small text-secondary mb-0">Пока нет заметок.</p>
      ) : null}

      {friendNotes.length > 0 && (
        <div className="d-flex flex-column gap-2 mt-3">
          {friendNotes.map((n) => (
            <div key={n.id} className="d-flex align-items-start gap-2">
              {n.userPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
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
                <span className="text-secondary">{n.userName || "Друг"}:</span> {n.text}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
