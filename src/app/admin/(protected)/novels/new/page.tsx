import Link from "next/link";
import NovelForm from "../NovelForm";
import { createNovel } from "../actions";

export const dynamic = "force-dynamic";

export default function NewNovelPage() {
  return (
    <div>
      <Link href="/admin/novels" className="eyebrow text-decoration-none">
        ← К списку новелл
      </Link>
      <h1 className="display-1-tight mt-3 mb-5" style={{ fontSize: "2rem" }}>
        Новая новелла
      </h1>
      <NovelForm action={createNovel} submitLabel="Создать новеллу" dramas={[]} />
    </div>
  );
}
