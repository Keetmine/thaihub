import AppLink from "@/components/AppLink";

/** Пустое состояние с подсказкой и следующим шагом — вместо голого
 *  серого «Пока пусто.» (см. design-direction). */
export default function EmptyState({
  emoji,
  title,
  hint,
  cta,
  compact,
}: {
  emoji?: string;
  title: string;
  hint?: string;
  cta?: { href: string; label: string };
  /** Компактный вариант — для колонок/половинок экрана. */
  compact?: boolean;
}) {
  return (
    <div className={`surface text-center ${compact ? "p-4" : "p-5"}`}>
      {emoji && (
        <div className="mb-2" style={{ fontSize: compact ? "1.6rem" : "2rem" }} aria-hidden>
          {emoji}
        </div>
      )}
      <p className="font-display fw-medium text-white mb-1">{title}</p>
      {hint && <p className="small text-secondary mb-0">{hint}</p>}
      {cta && (
        <AppLink href={cta.href} className="btn btn-primary btn-sm mt-3">
          {cta.label}
        </AppLink>
      )}
    </div>
  );
}
