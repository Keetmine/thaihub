import { prisma } from "@/lib/prisma";

/** Пишет ошибку в /admin/errors; сам никогда не бросает. */
export async function logError(
  error: unknown,
  context?: { path?: string; digest?: string },
): Promise<void> {
  try {
    const e = error instanceof Error ? error : new Error(String(error));
    await prisma.errorLog.create({
      data: {
        message: e.message.slice(0, 1000),
        stack: e.stack?.slice(0, 4000) ?? null,
        path: context?.path ?? null,
        digest: context?.digest ?? null,
      },
    });
  } catch {
    // лог не должен ронять то, что логирует
  }
}
