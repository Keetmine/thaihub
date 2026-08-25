import Link from "@/components/AppLink";
import { getT } from "@/lib/i18n";

// 404 внутри публичного лейаута (сюда триггерит и catch-all
// [...missing]). Компактный, чтобы футер не уезжал за скролл.
export default async function NotFound() {
  const { t } = await getT();
  return (
    <div className="glow-panel text-center mx-auto p-5" style={{ maxWidth: "30rem" }}>
      <p className="mb-2" style={{ fontSize: "2.2rem" }} aria-hidden>
        🔦
      </p>
      <p className="display-1-tight mb-2" style={{ fontSize: "2.6rem" }}>
        404
      </p>
      <p className="text-secondary mb-4">
        {t.widgets.errors.notFoundHint}
      </p>
      <div className="d-flex flex-wrap justify-content-center gap-2">
        <Link href="/" className="btn btn-primary btn-sm">
          {t.widgets.errors.goHome}
        </Link>
        <Link href="/search" className="btn btn-ghost btn-sm">
          {t.widgets.errors.goSearch}
        </Link>
      </div>
    </div>
  );
}
