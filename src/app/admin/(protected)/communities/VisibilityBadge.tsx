import type { CommunityVisibility } from "@/generated/prisma/client";

/**
 * «Закрытое» / «Открытое» одной пометкой. Отдельным компонентом, потому
 * что видимость — главное, что админ должен видеть о сообществе, и в
 * списке и в карточке она обязана выглядеть одинаково: закрытое
 * сообщество не видно ни в витрине, ни поисковикам, и перепутать его с
 * открытым — значит неверно оценить, кто вообще прочитал написанное.
 */
export function VisibilityBadge({ visibility }: { visibility: CommunityVisibility }) {
  return visibility === "PRIVATE" ? (
    <span className="badge rounded-pill text-bg-secondary ms-2">закрытое</span>
  ) : (
    <span className="badge rounded-pill text-bg-success ms-2">открытое</span>
  );
}
