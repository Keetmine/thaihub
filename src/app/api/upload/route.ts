import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { isAdminAuthenticated } from "@/lib/auth";
import { getCurrentUser } from "@/lib/userAuth";
import { toWebp } from "@/lib/localImage";

const MAX_SIZE = 8 * 1024 * 1024;

// Allowlist only — no image/svg+xml, which can carry an executable <script>
// and would be served back verbatim as a static file from /public/uploads.
// JPEG/PNG/WebP get re-encoded to WebP on save (toWebp); GIFs are kept
// as-is to preserve animation.
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export async function POST(request: Request) {
  const [isAdmin, user] = await Promise.all([isAdminAuthenticated(), getCurrentUser()]);
  if (!isAdmin && !user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Файл не найден" }, { status: 400 });
  }
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "Можно загружать только JPEG, PNG, WEBP или GIF" },
      { status: 400 }
    );
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Файл слишком большой (максимум 8MB)" }, { status: 400 });
  }

  const raw = Buffer.from(await file.arrayBuffer());
  let converted: { buffer: Buffer; ext: string };
  try {
    converted = await toWebp(raw, file.type);
  } catch {
    // Битый/не читающийся файл — не сохраняем что попало.
    return NextResponse.json({ error: "Не удалось обработать изображение" }, { status: 400 });
  }

  const filename = `${randomUUID()}${converted.ext}`;
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(path.join(uploadsDir, filename), converted.buffer);

  return NextResponse.json({ url: `/uploads/${filename}` });
}
