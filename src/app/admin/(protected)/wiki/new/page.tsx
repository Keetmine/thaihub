import { requireAdminPage } from "@/lib/auth";
import Link from "next/link";
import WikiForm from "../WikiForm";
import { createWikiArticle } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewWikiPage() {
  await requireAdminPage();
  return (
    <div>
      <Link href="/admin/wiki" className="eyebrow text-decoration-none">
        ← К списку статей
      </Link>
      <h1 className="display-1-tight mt-3 mb-5" style={{ fontSize: "2rem" }}>
        Новая статья
      </h1>
      <WikiForm action={createWikiArticle} submitLabel="Создать статью" />
    </div>
  );
}
