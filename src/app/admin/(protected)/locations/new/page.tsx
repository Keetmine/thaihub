import Link from "next/link";
import LocationForm from "../LocationForm";
import { createLocation } from "../actions";

export default function NewLocationPage() {
  return (
    <div>
      <Link href="/admin/locations" className="eyebrow text-decoration-none">
        ← К списку локаций
      </Link>
      <h1 className="display-1-tight mt-3 mb-4" style={{ fontSize: "2rem" }}>
        Новая локация
      </h1>
      <LocationForm action={createLocation} submitLabel="Создать локацию" />
    </div>
  );
}
