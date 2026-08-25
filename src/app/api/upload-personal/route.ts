import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/userAuth";
import { privateUploadsDir } from "@/lib/privateUploads";
import { allowedFormats, type UploadErrorBody } from "@/lib/uploadErrors";

const MAX_MB = 10;
const MAX_SIZE = MAX_MB * 1024 * 1024;

// Картинки к личным событиям поездки (скан билета, скрин брони,
// афиша). Запись приватная — файл тоже: лежит вне public/ и раздаётся
// через /files/personal/… с проверкой участия в поездке.
const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

// Текст ошибки собирает клиент: язык страницы сюда не доходит — её
// дёргают по адресу без языкового префикса. См. src/lib/uploadErrors.ts.
const fail = (body: UploadErrorBody, status: number) => NextResponse.json(body, { status });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
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

  const dir = privateUploadsDir("personal");
  await mkdir(dir, { recursive: true });
  const fileName = `${randomUUID()}${ext}`;
  await writeFile(path.join(dir, fileName), Buffer.from(await file.arrayBuffer()));

  return NextResponse.json({ url: `/files/personal/${fileName}` });
}
