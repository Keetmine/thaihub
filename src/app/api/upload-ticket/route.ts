import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/userAuth";

const MAX_SIZE = 10 * 1024 * 1024;

// Билеты — чаще всего PDF; картинки тоже принимаем (скрин билета).
// PDF сохраняется как есть (не исполняемый в статике), картинки — тоже
// как есть: тут не витрина, пережимать в webp незачем. SVG запрещён
// (может нести <script> и отдаётся из /public/uploads как есть).
const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Файл не найден" }, { status: 400 });
  }
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json({ error: "Можно загрузить PDF, JPEG, PNG или WEBP" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Файл слишком большой (максимум 10MB)" }, { status: 400 });
  }

  const dir = path.join(process.cwd(), "public", "uploads", "tickets");
  await mkdir(dir, { recursive: true });
  const fileName = `${randomUUID()}${ext}`;
  await writeFile(path.join(dir, fileName), Buffer.from(await file.arrayBuffer()));

  return NextResponse.json({ url: `/uploads/tickets/${fileName}` });
}
