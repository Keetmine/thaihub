import Link from "next/link";

export default function ModeToggle({ active }: { active: "site" | "admin" }) {
  return (
    <div className="mode-toggle">
      <Link
        href="/"
        prefetch={false}
        className={`mode-toggle-option ${active === "site" ? "active" : ""}`}
      >
        Сайт
      </Link>
      <Link
        href="/admin"
        prefetch={false}
        className={`mode-toggle-option ${active === "admin" ? "active" : ""}`}
      >
        Админка
      </Link>
    </div>
  );
}
