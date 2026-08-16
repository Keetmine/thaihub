import { redirect } from "next/navigation";

// Дашборд переехал на главную админки — старый адрес редиректит.
export default function AdminStatsRedirect() {
  redirect("/admin");
}
