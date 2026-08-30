"use client";

import { useEffect, useState } from "react";
import { useT } from "@/components/LocaleProvider";

/**
 * Фото схем зала и бенефитов на странице события (Ж9): миниатюры одним
 * рядом с небольшим зазором, без заголовков и подписей (правки
 * владельца после первой версии с двумя озаглавленными колонками).
 * Клик поднимает фото попапом на весь экран — не новая вкладка:
 * рассмотрел схему и остался на странице. Закрытие — клик в любом
 * месте, крестик или Esc.
 */
export default function EventPhotoGallery({ photos }: { photos: { id: string; url: string }[] }) {
  const t = useT();
  const [openUrl, setOpenUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!openUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenUrl(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openUrl]);

  if (photos.length === 0) return null;

  return (
    <div className="d-flex flex-wrap gap-2 mb-3">
      {photos.map((p) => (
        <button
          key={p.id}
          type="button"
          className="event-photo-thumb"
          aria-label={t.events.detail.photoFullSize}
          title={t.events.detail.photoFullSize}
          onClick={() => setOpenUrl(p.url)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img loading="lazy" decoding="async" src={p.url} alt="" />
        </button>
      ))}

      {openUrl && (
        <div
          className="event-photo-lightbox"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpenUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={openUrl} alt="" />
          <button
            type="button"
            className="event-photo-lightbox-close"
            aria-label={t.ui.close}
            onClick={() => setOpenUrl(null)}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
