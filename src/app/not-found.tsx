import Link from "next/link";

// Компактный 404 вместо дефолтного некстовского (тот центрирует себя на
// 100vh и вместе с шапкой/футером растягивает страницу — футер уезжал
// за скролл).
export default function NotFound() {
  return (
    <div className="text-center py-5">
      <p className="display-1-tight mb-2" style={{ fontSize: "3rem" }}>
        404
      </p>
      <p className="text-secondary mb-4">
        Такой страницы нет — возможно, её удалили или ссылка с опечаткой.
      </p>
      <Link href="/" className="btn btn-primary btn-sm">
        На главную
      </Link>
    </div>
  );
}
