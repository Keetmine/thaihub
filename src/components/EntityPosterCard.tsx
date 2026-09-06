"use client";

import type { ReactNode } from "react";
import AppLink from "@/components/AppLink";
import UploadImage from "@/components/UploadImage";

/**
 * Карточка каталога: крупное фото, под ним имя и тихая приписка.
 *
 * Живёт отдельным компонентом, потому что этот вид сложился в списке
 * артистов (`AlphabetDataList variant="cards"`), а потом понадобился и
 * в глобальном поиске (АА22): артисты там выводились строками, и одна и
 * та же выдача выглядела в двух местах по-разному. Копия разметки
 * разошлась бы с первой же правкой.
 *
 * Кнопки (избранное, «в список») карточка не знает — их передают
 * детьми, и она кладёт их поверх правого верхнего угла.
 */
export default function EntityPosterCard({
  href,
  name,
  photoUrl,
  /** Приписка под именем: настоящее имя, год, автор. */
  subtitle,
  /** Плашка в углу фото — например, дата. */
  meta,
  aspect = "3 / 4",
  children,
}: {
  href: string;
  name: string;
  photoUrl?: string | null;
  subtitle?: string | null;
  meta?: string | null;
  aspect?: "3 / 4" | "4 / 3";
  children?: ReactNode;
}) {
  return (
    <div className="position-relative">
      <AppLink href={href} className="text-decoration-none d-block">
        <div
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: aspect,
            borderRadius: "0.9rem",
            background: "var(--bs-secondary-bg)",
            overflow: "hidden",
          }}
        >
          {photoUrl ? (
            <UploadImage
              src={photoUrl}
              alt=""
              sizes="(max-width: 575.98px) 45vw, 12rem"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <span
              className="d-flex align-items-center justify-content-center h-100 font-display fw-bold"
              style={{ fontSize: "2rem", color: "rgba(255,154,114,0.45)" }}
              aria-hidden
            >
              {name.trim().charAt(0).toUpperCase()}
            </span>
          )}
          {meta && (
            <span className="date-chip position-absolute" style={{ left: "0.5rem", bottom: "0.5rem" }}>
              {meta}
            </span>
          )}
        </div>
        <p className="small text-white mb-0 mt-2 text-truncate" style={{ lineHeight: 1.3 }}>
          {name}
        </p>
        {subtitle && <p className="small text-secondary mb-0 text-truncate">{subtitle}</p>}
      </AppLink>
      {children && (
        <div
          className="position-absolute d-flex align-items-center gap-1"
          style={{ top: "0.375rem", right: "0.375rem" }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
