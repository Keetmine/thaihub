import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isCatalogEditor } from "@/lib/auth";
import type { TtmEvent } from "@/lib/thaiticketmajor";

// Прокси постера для очереди черновиков (вкладка «События» импортов).
// Прямой <img src="https://www.thaiticketmajor.com/img_poster/…"> в
// браузере не работает: их Akamai режет кросс-сайтовую загрузку картинок
// (Sec-Fetch-Site: cross-site → 403-страница → ERR_BLOCKED_BY_ORB), а
// серверный fetch тот же файл отдаёт спокойно. В базу ссылка на чужой
// хост при этом по-прежнему не пишется — скачивание к нам происходит
// только при одобрении черновика (downloadRemoteImage внутри
// createEventFromTtmImport).
//
// SSRF-защиты ради адрес наружу не принимается вовсе: параметр — id
// черновика, URL берётся из его payload и проверяется на хост TTM.

export async function GET(req: NextRequest): Promise<Response> {
  // Route handler живёт вне гейта layout'а — проверяем роль сами. Та же
  // роль, что у страницы импортов (менеджер каталога тоже видит очередь).
  if (!(await isCatalogEditor())) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const draftId = req.nextUrl.searchParams.get("draft") ?? "";
  const draft = await prisma.eventDraft.findUnique({
    where: { id: draftId },
    select: { payload: true },
  });
  const posterUrl = (draft?.payload as Partial<TtmEvent> | null)?.posterUrl;
  if (!posterUrl) return new NextResponse("Not found", { status: 404 });

  let parsed: URL;
  try {
    parsed = new URL(posterUrl);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  // Хосты постеров черновиков: TTM, thaistarx.com, Ticketmelon (свой
  // домен и их S3-бакет), AllTicket (atkmedia), a-ara.co.jp — один
  // прокси, чтобы очередь не хотлинкала чужие картинки напрямую.
  const host = parsed.hostname.toLowerCase();
  const allowed = ["thaiticketmajor.com", "thaistarx.com", "ticketmelon.com", "allticket.com", "a-ara.co.jp", "tm-prod-event-files-v3.s3.ap-southeast-1.amazonaws.com"].some(
    (h) => host === h || host.endsWith(`.${h}`),
  );
  if (parsed.protocol !== "https:" || !allowed) {
    return new NextResponse("Not found", { status: 404 });
  }

  const upstream = await fetch(parsed, { signal: AbortSignal.timeout(15000) });
  if (!upstream.ok || !upstream.body) {
    return new NextResponse("Upstream error", { status: 502 });
  }
  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    return new NextResponse("Upstream error", { status: 502 });
  }
  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": contentType,
      // Постер черновика не меняется — час кэша избавляет от повторных
      // походов на TTM при каждом обновлении очереди.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
