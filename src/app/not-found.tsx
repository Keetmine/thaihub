import Link from "@/components/AppLink";
import { getT } from "@/lib/i18n";

// Корневой 404 — промахи мимо публичного лейаута (/files/…, чужие
// /api-пути, адреса вне каталога). Компактный вместо дефолтного
// некстовского (тот центрирует себя на 100vh и вместе с шапкой/футером
// растягивает страницу — футер уезжал за скролл).
export default async function NotFound() {
  const { t } = await getT();
  return (
    <div className="text-center py-5">
      <p className="display-1-tight mb-2" style={{ fontSize: "3rem" }}>
        404
      </p>
      <p className="text-secondary mb-4">{t.widgets.errors.notFoundHint}</p>
      <Link href="/" className="btn btn-primary btn-sm">
        {t.widgets.errors.goHome}
      </Link>
    </div>
  );
}
