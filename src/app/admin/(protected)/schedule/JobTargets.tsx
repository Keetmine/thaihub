"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import EntitySelect from "@/components/EntitySelect";
import LetterAvatar from "@/components/LetterAvatar";
import { TrashIcon } from "@/components/icons";
import { searchPerformerOptions } from "../performers/actions";
import { addJobTarget, removeJobTarget } from "./actions";

/**
 * Список артистов, которых проверяет задача. По умолчанию проверяются
 * все подходящие — этот список нужен, когда хочется сузить круг
 * (например, гонять новинки только по своим фаворитам, а не по всему
 * каталогу).
 */
export default function JobTargets({
  jobKey,
  targets,
  active,
}: {
  jobKey: string;
  targets: { id: string; name: string; photoUrl: string | null }[];
  /** Режим «только выбранные» включён — иначе список носит справочный характер. */
  active: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className={active ? "" : "opacity-75"}>
      <p className="small text-secondary mb-2">
        {active
          ? "Проверяются только эти артисты."
          : "Список сохранится, но сейчас задача идёт по всем подходящим."}
      </p>

      <div className="mb-2" style={{ maxWidth: "22rem" }}>
        <EntitySelect
          name={`target-${jobKey}`}
          options={[]}
          placeholder="Добавить артиста…"
          hrefKind="Performer"
          searchOptions={searchPerformerOptions}
          onChange={(id) => {
            if (!id) return;
            setError(null);
            startTransition(async () => {
              try {
                await addJobTarget(jobKey, id);
                router.refresh();
              } catch {
                setError("Не удалось добавить — обновите страницу и попробуйте ещё раз");
              }
            });
          }}
        />
      </div>

      {error && <p className="small text-danger">{error}</p>}

      {targets.length === 0 ? (
        <p className="small text-secondary mb-0">Пока никого не выбрано.</p>
      ) : (
        <div className="d-flex flex-wrap gap-2">
          {targets.map((t) => (
            <span
              key={t.id}
              className="surface d-inline-flex align-items-center gap-2 px-2 py-1"
            >
              <LetterAvatar name={t.name} photoUrl={t.photoUrl} size={1.5} />
              <span className="small text-white">{t.name}</span>
              <button
                type="button"
                className="icon-btn icon-btn-danger"
                aria-label={`Убрать ${t.name}`}
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    await removeJobTarget(jobKey, t.id);
                    router.refresh();
                  })
                }
              >
                <TrashIcon />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
