"use client";

import { useMemo, useRef, useState } from "react";

export type PerformerLinkInput = { label: string; url: string };
export type PerformerOption = { id: string; name: string };

export default function PerformerForm({
  action,
  submitLabel,
  soloPerformers,
  defaultValues,
  defaultMemberIds,
}: {
  action: (formData: FormData) => void;
  submitLabel: string;
  /** Existing SOLO performers, for the pairing-partner select and the band-members picker. */
  soloPerformers: PerformerOption[];
  defaultValues?: {
    name: string;
    type: string;
    birthDate: string;
    bio: string;
    agency: string;
    photoUrl: string;
    mydramalistUrl: string;
    links: PerformerLinkInput[];
  };
  /** Pre-filled band member ids, for editing an existing BAND performer. */
  defaultMemberIds?: string[];
}) {
  const v = defaultValues;
  const isCreating = !v;

  const [type, setType] = useState(v?.type ?? "SOLO");

  const [links, setLinks] = useState<PerformerLinkInput[]>(
    v?.links && v.links.length > 0 ? v.links : [{ label: "", url: "" }],
  );

  function addLink() {
    setLinks((prev) => [...prev, { label: "", url: "" }]);
  }

  function removeLink(index: number) {
    setLinks((prev) => prev.filter((_, i) => i !== index));
  }

  function updateLink(index: number, field: "label" | "url", value: string) {
    setLinks((prev) =>
      prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)),
    );
  }

  // --- Band members (only relevant when type === "BAND") ---
  const [memberIds, setMemberIds] = useState<string[]>(defaultMemberIds ?? []);
  const [memberQuery, setMemberQuery] = useState("");
  const [isMemberDropdownOpen, setIsMemberDropdownOpen] = useState(false);
  const memberComboboxRef = useRef<HTMLDivElement>(null);

  const selectedMembers = useMemo(
    () => memberIds.map((id) => soloPerformers.find((p) => p.id === id)).filter(
      (p): p is PerformerOption => Boolean(p),
    ),
    [memberIds, soloPerformers],
  );

  const filteredMemberOptions = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    return soloPerformers.filter((p) => {
      if (memberIds.includes(p.id)) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q);
    });
  }, [soloPerformers, memberIds, memberQuery]);

  function addMember(id: string) {
    setMemberIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setMemberQuery("");
  }

  function removeMember(id: string) {
    setMemberIds((prev) => prev.filter((mid) => mid !== id));
  }

  return (
    <form
      action={action}
      className="surface d-flex flex-column gap-3 p-4"
      style={{ maxWidth: "50rem" }}
    >
      <div className="row g-3">
        <div className="col-12 col-lg-8">
          <label className="form-label">Имя / название группы *</label>
          <input
            name="name"
            required
            defaultValue={v?.name}
            className="form-control"
          />
        </div>
        <div className="col-12 col-lg-4">
          <label className="form-label">Тип</label>
          <select
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="form-select"
          >
            <option value="SOLO">Соло</option>
            <option value="BAND">Группа</option>
          </select>
        </div>
      </div>

      {type === "SOLO" && (
        <div className="row g-3">
          <div className="col-12 col-sm-6">
            <label className="form-label">Дата рождения</label>
            <input
              type="date"
              name="birthDate"
              defaultValue={v?.birthDate}
              className="form-control"
            />
          </div>
          <div className="col-12 col-sm-6">
            <label className="form-label">Агентство</label>
            <input
              name="agency"
              defaultValue={v?.agency}
              className="form-control"
            />
          </div>
        </div>
      )}

      {type === "BAND" && (
        <div>
          <label className="form-label">Агентство</label>
          <input
            name="agency"
            defaultValue={v?.agency}
            className="form-control"
          />
        </div>
      )}

      <div>
        <label className="form-label">Фото (ссылка)</label>
        <input
          type="url"
          name="photoUrl"
          defaultValue={v?.photoUrl}
          placeholder="https://…"
          className="form-control"
        />
      </div>

      <div>
        <label className="form-label">{type === "BAND" ? "О группе" : "Биография"}</label>
        <textarea
          name="bio"
          rows={4}
          defaultValue={v?.bio}
          className="form-control"
        />
      </div>

      <input
        type="hidden"
        name="mydramalistUrl"
        defaultValue={v?.mydramalistUrl ?? ""}
      />

      <div>
        <label className="form-label d-block">Ссылки</label>
        <div className="d-flex flex-column gap-2">
          {links.map((link, i) => (
            <div key={i} className="row g-2 align-items-center">
              <div className="col-4">
                <input
                  type="text"
                  name="linkLabel"
                  placeholder="Название (Instagram, X…)"
                  value={link.label}
                  onChange={(e) => updateLink(i, "label", e.target.value)}
                  className="form-control"
                />
              </div>
              <div className="col-7">
                <input
                  type="url"
                  name="linkUrl"
                  placeholder="https://…"
                  value={link.url}
                  onChange={(e) => updateLink(i, "url", e.target.value)}
                  className="form-control"
                />
              </div>
              <div className="col-1">
                <button
                  type="button"
                  className="btn btn-outline-danger btn-sm"
                  onClick={() => removeLink(i)}
                  aria-label="Удалить ссылку"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm mt-2"
          onClick={addLink}
        >
          + Добавить ссылку
        </button>
      </div>

      {type === "BAND" && (
        <div>
          <label className="form-label d-block">Участники группы</label>

          {selectedMembers.length > 0 && (
            <div className="d-flex flex-wrap gap-2 mb-2">
              {selectedMembers.map((m) => (
                <span key={m.id} className="event-chip performer-chip">
                  {m.name}
                  <input type="hidden" name="memberIds" value={m.id} />
                  <button
                    type="button"
                    className="performer-chip-remove"
                    onClick={() => removeMember(m.id)}
                    aria-label={`Убрать ${m.name}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="performer-combobox" ref={memberComboboxRef}>
            <input
              type="text"
              className="form-control"
              placeholder="Начните вводить имя участника…"
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
              onFocus={() => setIsMemberDropdownOpen(true)}
              onBlur={() => {
                window.setTimeout(() => setIsMemberDropdownOpen(false), 150);
              }}
            />

            {isMemberDropdownOpen && filteredMemberOptions.length > 0 && (
              <div className="performer-combobox-dropdown">
                {filteredMemberOptions.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="performer-combobox-option"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => addMember(p.id)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {soloPerformers.length === 0 && (
            <p className="small text-secondary mt-2">
              Нет соло-исполнителей, которых можно добавить как участников.
            </p>
          )}
        </div>
      )}

      {isCreating && type === "SOLO" && (
        <div>
          <label className="form-label d-block">Пейринг (необязательно)</label>
          <p className="small text-secondary mt-n1 mb-2">
            Сразу связать этого исполнителя в пару с уже существующим.
          </p>
          <div className="row g-2">
            <div className="col-12 col-sm-7">
              <select name="pairingPartnerId" className="form-select" defaultValue="">
                <option value="">Не создавать пейринг</option>
                {soloPerformers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-12 col-sm-5">
              <input
                type="text"
                name="pairingName"
                placeholder="Название пейринга (необязательно)"
                className="form-control"
              />
            </div>
          </div>
        </div>
      )}

      <div className="mt-2">
        <button type="submit" className="btn btn-primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
