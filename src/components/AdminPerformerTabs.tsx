import Link from "next/link";

export default function AdminPerformerTabs({
  active,
}: {
  active: "performers" | "bands" | "pairings" | "agencies";
}) {
  return (
    <div className="tab-bar">
      <Link
        href="/admin/performers"
        prefetch={false}
        className={`tab-bar-item ${active === "performers" ? "active" : ""}`}
      >
        Актёры
      </Link>
      <Link
        href="/admin/performers?view=bands"
        prefetch={false}
        className={`tab-bar-item ${active === "bands" ? "active" : ""}`}
      >
        Группы
      </Link>
      <Link
        href="/admin/pairings"
        prefetch={false}
        className={`tab-bar-item ${active === "pairings" ? "active" : ""}`}
      >
        Пейринги
      </Link>
      <Link
        href="/admin/performers?view=agencies"
        prefetch={false}
        className={`tab-bar-item ${active === "agencies" ? "active" : ""}`}
      >
        Агентства
      </Link>
    </div>
  );
}
