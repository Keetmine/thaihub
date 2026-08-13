import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/userAuth";
import { logout } from "../login/actions";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="surface p-4" style={{ maxWidth: "32rem" }}>
      <h1 className="h4 mb-1">{user.name || user.email}</h1>
      <p className="text-secondary small mb-4">{user.email}</p>
      <form action={logout}>
        <button type="submit" className="btn btn-outline-secondary btn-sm">
          Выйти
        </button>
      </form>
    </div>
  );
}
