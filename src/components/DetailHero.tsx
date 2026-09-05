/** Иммерсивная шапка детальной страницы (.detail-hero в globals.css):
 *  размытое фото записи фоном, карточка-фото и крупный титул поверх.
 *  Без фото — тёплый градиент из тех же токенов. Используется на
 *  страницах артиста, сериала, новеллы, события, локации. */
export default function DetailHero({
  photoUrl,
  photoAlt,
  photoShape = "portrait",
  title,
  subtitle,
  chips,
  actions,
  footer,
}: {
  photoUrl?: string | null;
  photoAlt?: string;
  /** «circle» — для логотипов (агентства): портретная карточка 3/4
   *  режет квадратное лого по бокам (у GMMTV «GMM» превращалось в
   *  «MM»), круг 1/1 повторяет кружок из списков и ничего не теряет. */
  photoShape?: "portrait" | "circle";
  title: React.ReactNode;
  /** Строка под титулом (реальное имя, год, площадка…). */
  subtitle?: React.ReactNode;
  /** Ряд чипов над титулом (.date-chip). */
  chips?: React.ReactNode;
  /** Кнопки действий (сердечко, «иду», «+ в список»). */
  actions?: React.ReactNode;
  /** Низ текстового блока (соцссылки, даты). */
  footer?: React.ReactNode;
}) {
  return (
    <section className="detail-hero">
      {photoUrl && (
        <div className="detail-hero-backdrop" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl} alt="" loading="eager" decoding="async" />
        </div>
      )}
      <div className="detail-hero-scrim" aria-hidden />
      <div className="detail-hero-content">
        {photoUrl && (
          <div
            className={`detail-hero-photo ${photoShape === "circle" ? "detail-hero-photo--circle" : ""}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt={photoAlt ?? ""} loading="eager" decoding="async" />
          </div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          {chips && <div className="detail-hero-chips mb-2">{chips}</div>}
          <h1 className="display-1-tight detail-hero-title mb-1">{title}</h1>
          {/* pre-line: подзаголовок бывает описанием с абзацами
              (локации) — переносы не должны схлопываться. */}
          {subtitle && (
            <p className="text-secondary mb-2" style={{ whiteSpace: "pre-line" }}>
              {subtitle}
            </p>
          )}
          {footer}
        </div>
        {actions && (
          <div className="d-flex align-items-center gap-2 flex-shrink-0 mb-1">{actions}</div>
        )}
      </div>
    </section>
  );
}
