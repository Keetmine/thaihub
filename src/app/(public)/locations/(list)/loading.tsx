import PageSkeleton from "@/components/PageSkeleton";

// Скелет ТОЛЬКО для списка, а не для всего раздела.
//
// Группа маршрутов `(list)` на адрес не влияет, зато заводит свой
// уровень вложенности — и Suspense от этого loading.tsx накрывает
// только её. Уровнем выше он накрыл бы и `[id]`: карточка зовёт
// notFound(), а ответ из-под Suspense уже ушёл бы с кодом 200, и битый
// слаг отдавал бы «200 + экран 404». См. docs/features/seo.md.
export default function Loading() {
  return <PageSkeleton />;
}
