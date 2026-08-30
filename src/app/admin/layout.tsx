import type { Metadata } from "next";
// Стили админки — только здесь, а не в globals.css: корневой layout
// раздаёт globals.css каждой публичной странице, и админские правила
// ехали бы вместе с ним, ни разу не применившись.
import "./admin.css";

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
