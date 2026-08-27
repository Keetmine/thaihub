"use client";

import { useId, useState } from "react";
import EntityMultiSelect from "@/components/EntityMultiSelect";
import LetterAvatar from "@/components/LetterAvatar";
import { useT } from "@/components/LocaleProvider";
import { searchPerformersForList } from "@/app/(public)/artist-lists/actions";
import { saveOnboardingFavorites } from "./actions";

/** Плитки популярных + мультиселект для поиска остальных. */
export default function WelcomePicker({
  popular,
}: {
  popular: { id: string; name: string; photoUrl: string | null }[];
}) {
  const uid = useId();
  const t = useT();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <form action={saveOnboardingFavorites} className="d-flex flex-column gap-4">
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="performerIds" value={id} />
      ))}

      <div className="d-flex flex-wrap gap-2">
        {popular.map((p) => {
          const active = selected.has(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              aria-pressed={active}
              className={`surface d-inline-flex align-items-center gap-2 py-1 ps-1 pe-3 border-0 ${
                active ? "" : "surface-hover"
              }`}
              style={{
                borderRadius: "2rem",
                outline: active ? "2px solid var(--bs-primary)" : "none",
              }}
            >
              <LetterAvatar name={p.name} photoUrl={p.photoUrl} size={1.75} />
              <span className={`small ${active ? "text-white fw-medium" : "text-secondary"}`}>
                {p.name}
              </span>
            </button>
          );
        })}
      </div>

      <div>
        <label className="form-label small text-secondary" htmlFor={`${uid}-performerIds`}>
          {t.auth.welcome.searchLabel}
        </label>
        <EntityMultiSelect id={`${uid}-performerIds`}
          name="performerIds"
          options={[]}
          placeholder={t.auth.welcome.searchPlaceholder}
          searchOptions={searchPerformersForList}
        />
      </div>

      <button type="submit" className="btn btn-primary align-self-start">
        {t.auth.welcome.submit}
      </button>
    </form>
  );
}
