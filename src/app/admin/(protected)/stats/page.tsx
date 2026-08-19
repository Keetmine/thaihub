import { redirect } from "next/navigation";

export const metadata = { title: "Статистика" };

// Дашборд переехал на главную админки — старый адрес редиректит.
export default function AdminStatsRedirect() {
  redirect("/admin");
}
