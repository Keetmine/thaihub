import Link from "@/components/AppLink";
import { useT } from "@/components/LocaleProvider";

/**
 * Заглушка платного блока внутри кабинета: показываем, что за подпиской,
 * вместо того чтобы прятать раздел совсем — так человек понимает, за что
 * платит, а не думает, что функции не существует.
 */
export default function PremiumTeaser({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const t = useT();
  return (
    <div className="premium-teaser surface p-4 mb-4 text-center">
      <div style={{ fontSize: "1.5rem" }} aria-hidden="true">
        ✨
      </div>
      <p className="fw-medium text-white mb-1">{title}</p>
      <p className="small text-secondary mb-3">{description}</p>
      <Link href="/calendar" className="btn btn-primary btn-sm">
        {t.widgets.premium.subscribe}
      </Link>
    </div>
  );
}
