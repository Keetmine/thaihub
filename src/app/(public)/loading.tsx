import PageSkeleton from "@/components/PageSkeleton";

// Один loading.tsx на всю route-группу: любая публичная страница
// (все они force-dynamic) при навигации мгновенно показывает скелет
// вместо белой паузы.
export default function Loading() {
  return <PageSkeleton />;
}
