import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { isAdminAuthenticated } from "@/lib/auth";
import { getCurrentUser } from "@/lib/userAuth";
import { toWebp } from "@/lib/localImage";
import { allowedFormats, type UploadErrorBody } from "@/lib/uploadErrors";

const MAX_MB = 8;
const MAX_SIZE = MAX_MB * 1024 * 1024;

// Allowlist only — no image/svg+xml, which can carry an executable <script>
// and would be served back verbatim as a static file from /public/uploads.
// JPEG/PNG/WebP get re-encoded to WebP on save (toWebp); GIFs are kept
// as-is to preserve animation.
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  // Брони отелей и билеты чаще всего приходят PDF-файлом. В WebP их,
  // разумеется, не конвертируем — сохраняем как есть.
  "application/pdf": ".pdf",
};

// Текст ошибки собирает клиент: язык страницы сюда не доходит — её
// дёргают по адресу без языкового префикса. См. src/lib/uploadErrors.ts.
const fail = (body: UploadErrorBody, status: number) => NextResponse.json(body, { status });

export async function POST(request: Request) {
  const [isAdmin, user] = await Promise.all([isAdminAuthenticated(), getCurrentUser()]);
  if (!isAdmin && !user) {
    return fail({ error: "NOT_AUTHORIZED" }, 401);
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return fail({ error: "NO_FILE" }, 400);
  }
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return fail({ error: "BAD_TYPE", formats: allowedFormats(ALLOWED_TYPES) }, 400);
  }
  if (file.size > MAX_SIZE) {
    return fail({ error: "TOO_LARGE", maxMb: MAX_MB }, 400);
  }

  const raw = Buffer.from(await file.arrayBuffer());
  let converted: { buffer: Buffer; ext: string };
  if (file.type === "application/pdf") {
    converted = { buffer: raw, ext: ".pdf" };
  } else
  try {
    converted = await toWebp(raw, file.type);
  } catch {
    // Битый/не читающийся файл — не сохраняем что попало.
    return fail({ error: "BAD_IMAGE" }, 400);
  }

  const filename = `${randomUUID()}${converted.ext}`;
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(path.join(uploadsDir, filename), converted.buffer);

  return NextResponse.json({ url: `/uploads/${filename}` });
}
