import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Health-проба для docker-compose healthcheck и внешнего аптайм-монитора:
// живой процесс + живая БД. Открыт без сессии (см. matcher в proxy.ts —
// /api/* пропускается, роуты сами решают про авторизацию; здесь ничего
// чувствительного не отдаётся).
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, db: "unreachable" }, { status: 503 });
  }
}
