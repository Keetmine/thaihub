import Link from "next/link";

export default function AdminPerformerTabs({ active }: { active: "performers" | "pairings" }) {
  return (
    <div className="mode-toggle mb-4">
      <Link
        href="/admin/performers"
        prefetch={false}
        className={`mode-toggle-option ${active === "performers" ? "active" : ""}`}
      >
        Исполнители
      </Link>
      <Link
        href="/admin/pairings"
        prefetch={false}
        className={`mode-toggle-option ${active === "pairings" ? "active" : ""}`}
      >
        Пейринги
      </Link>
    </div>
  );
}
