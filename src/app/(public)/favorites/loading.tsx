import PageSkeleton from "@/components/PageSkeleton";

// Скелет на время загрузки — ТОЛЬКО у разделов, внутри которых нет
// страниц, зовущих notFound(). Раньше файл был один на всю группу
// (public), и это молча ломало коды ответа: loading.tsx заводит вокруг
// сегмента Suspense, ответ уходит с кодом 200 ещё до того, как страница
// решит, что записи нет, — и любой битый слаг отдавал «200 + экран 404».
// См. docs/features/seo.md, «Несуществующие адреса».
export default function Loading() {
  return <PageSkeleton />;
}
