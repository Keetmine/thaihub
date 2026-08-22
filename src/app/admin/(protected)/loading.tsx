import PageSkeleton from "@/components/PageSkeleton";

// Скелет контентной области админки: сайдбар из layout остаётся
// интерактивным, а вместо белой паузы force-dynamic страниц — шиммер.
export default function Loading() {
  return <PageSkeleton rows={8} />;
}
