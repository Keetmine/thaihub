"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/userAuth";
import {
  getMdlListRunState,
  parseMdlListInput,
  startMdlListImport,
  type MdlListRunState,
} from "@/lib/mdlListImport";

// Импорт списка просмотра с MyDramaList — экшены формы в настройках.
//
// Прогон ДОЛЬШЕ одного запроса (десяток походов на чужой сайт с
// паузами, при Cloudflare — ещё и подъём браузера), поэтому паттерн
// тот же, что у импортов в /admin/imports: экшен запускает работу в
// фоне (fire-and-forget) и сразу отпускает форму, а форма поллит
// состояние вторым экшеном. Отличие от админки — журнал не ImportRun,
// а лёгкое in-memory состояние per-userId в mdlListImport.ts: писать
// пользовательские прогоны в админский журнал незачем, а поднимать
// таблицу ради спиннера — избыточно (single-container deploy, как у
// rateLimit.ts).
//
// Ошибки уходят значением ({ errorKey }), а не throw: текст исключения
// из server action в проде до клиента не доезжает (см. sendFriendRequest).

export type StartResult =
  | { ok: true }
  | { ok: false; errorKey: "badInput" | "rateLimited" | "alreadyRunning" };

export async function startMdlImport(input: string): Promise<StartResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const nick = parseMdlListInput(String(input ?? ""));
  if (!nick) return { ok: false, errorKey: "badInput" };

  const started = startMdlListImport(user.id, nick);
  if (!started.ok) return { ok: false, errorKey: started.errorKey };
  return { ok: true };
}

/** Поллинг хода/итога. null — прогона нет (или сервер перезапустили и
 *  in-memory состояние пропало). После завершения освежаем страницы со
 *  статусами — «Смотрю сейчас» на главной и списки. */
export async function pollMdlImport(): Promise<MdlListRunState | null> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const state = getMdlListRunState(user.id);
  if (state?.state === "done") {
    revalidatePath("/");
    revalidatePath("/account");
    revalidatePath("/dramas");
  }
  return state;
}
