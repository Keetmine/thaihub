export default function NameSearchBox({
  action,
  q,
  hiddenFields,
  placeholder = "Поиск по названию…",
  className = "mb-4",
}: {
  action: string;
  q: string;
  hiddenFields?: Record<string, string>;
  placeholder?: string;
  /** Defaults to "mb-4" for standalone use; pass "" when placed inside a
   *  .tab-bar-row alongside tabs, which spaces itself. */
  className?: string;
}) {
  return (
    <form action={action} method="GET" className={className}>
      {hiddenFields &&
        Object.entries(hiddenFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      <div className="search-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={placeholder}
          className="pill-search"
        />
      </div>
    </form>
  );
}
