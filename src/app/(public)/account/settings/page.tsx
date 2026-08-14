import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/userAuth";
import FileDropzone from "@/components/FileDropzone";
import { updateProfile, getOrCreateIcsToken } from "../actions";
import ChangePasswordForm from "./ChangePasswordForm";
import IcsFeedSection from "./IcsFeedSection";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const icsToken = await getOrCreateIcsToken();

  return (
    <div>
      <Link href="/account" className="eyebrow text-decoration-none">
        ← Профиль
      </Link>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2rem" }}>
        Настройки
      </h1>

      <div className="d-flex flex-column gap-3">
        <div className="surface p-4" style={{ maxWidth: "32rem" }}>
          <h2 className="h6 fw-semibold mb-3">Профиль</h2>
          <form action={updateProfile} className="d-flex flex-column gap-3">
            <div>
              <label className="form-label">Имя</label>
              <input name="name" defaultValue={user.name ?? ""} className="form-control" />
            </div>
            <FileDropzone name="photoUrl" label="Фото" defaultValue={user.photoUrl ?? ""} />
            <button type="submit" className="btn btn-primary">
              Сохранить
            </button>
          </form>
        </div>

        <div className="surface p-4" style={{ maxWidth: "32rem" }}>
          <h2 className="h6 fw-semibold mb-3">Смена пароля</h2>
          <ChangePasswordForm />
        </div>

        <div className="surface p-4" style={{ maxWidth: "32rem" }}>
          <h2 className="h6 fw-semibold mb-3">Подписка на календарь</h2>
          <IcsFeedSection token={icsToken} />
        </div>
      </div>
    </div>
  );
}
