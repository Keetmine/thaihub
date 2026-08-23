import Link from "next/link";

// 404 внутри публичного лейаута (сюда триггерит и catch-all
// [...missing]). Компактный, чтобы футер не уезжал за скролл.
export default function NotFound() {
  return (
    <div className="glow-panel text-center mx-auto p-5" style={{ maxWidth: "30rem" }}>
      <p className="mb-2" style={{ fontSize: "2.2rem" }} aria-hidden>
        🔦
      </p>
      <p className="display-1-tight mb-2" style={{ fontSize: "2.6rem" }}>
        404
      </p>
      <p className="text-secondary mb-4">
        Такой страницы нет — возможно, её удалили или ссылка с опечаткой.
      </p>
      <div className="d-flex flex-wrap justify-content-center gap-2">
        <Link href="/" className="btn btn-primary btn-sm">
          На главную
        </Link>
        <Link href="/search" className="btn btn-ghost btn-sm">
          Поискать
        </Link>
      </div>
    </div>
  );
}
