"use client";

import PremiumTeaser from "@/components/PremiumTeaser";

/**
 * Клиентский мостик для PremiumTeaser: тот зовёт useT() и потому может
 * рендериться только внутри клиентской границы, а страница профиля —
 * серверная. Единственный компактный апселл вкладки «Статистика» у
 * бесплатного владельца (вместо двух гигантских пейволлов, как было в
 * кабинете).
 */
export default function StatsUpsell({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return <PremiumTeaser title={title} description={description} />;
}
