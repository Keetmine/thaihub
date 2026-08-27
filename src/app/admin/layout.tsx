import type { Metadata } from "next";

/**
 * Внешняя оболочка админки — сюда попадает и страница входа, до
 * проверки прав.
 *
 * `noindex` стоит здесь, а не только у защищённой части: robots.txt
 * закрывает /admin, но это просьба, а не запрет — адрес, попавший
 * поисковику по ссылке, он вправе показать в выдаче и без обхода.
 * Мета-тег на самой странице такой возможности не оставляет.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="admin-shell d-flex flex-column min-vh-100">{children}</div>;
}
