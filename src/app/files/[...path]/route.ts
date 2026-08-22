import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/userAuth";
import {
  PRIVATE_FILE_NAME,
  PRIVATE_FILE_TYPES,
  privateUploadsDir,
} from "@/lib/privateUploads";

// Раздача приватных загрузок (билеты, брони отелей) с проверкой прав:
// билет видит только его владелец, бронь — владелец и принятые
// участники поездки. Статика так не умеет — поэтому файлы лежат вне
// public/ (см. src/lib/privateUploads.ts).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Не авторизовано", { status: 401 });

  const { path: segments } = await params;
  if (segments.length !== 2) return new NextResponse("Не найдено", { status: 404 });
  const [folder, name] = segments;
  if (!PRIVATE_FILE_NAME.test(name)) {
    return new NextResponse("Не найдено", { status: 404 });
  }

  const url = `/files/${folder}/${name}`;
  let allowed = false;
  if (folder === "tickets") {
    allowed = !!(await prisma.eventAttendance.findFirst({
      where: { ticketUrl: url, userId: user.id },
      select: { userId: true },
    }));
  } else if (folder === "hotels") {
    allowed = !!(await prisma.tripHotel.findFirst({
      where: {
        fileUrl: url,
        trip: {
          OR: [
            { userId: user.id },
            { members: { some: { userId: user.id, status: "ACCEPTED" } } },
          ],
        },
      },
      select: { id: true },
    }));
  }
  if (!allowed) return new NextResponse("Не найдено", { status: 404 });

  let data: Buffer;
  try {
    data = await readFile(privateUploadsDir(folder, name));
  } catch {
    return new NextResponse("Не найдено", { status: 404 });
  }
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": PRIVATE_FILE_TYPES[path.extname(name)] ?? "application/octet-stream",
      "Content-Disposition": "inline",
      // Приватный контент: пусть кэшируется только у самого пользователя.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
