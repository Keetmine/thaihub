"use client";

import { useRef, useState } from "react";
import CommentPhotoPicker from "@/components/CommentPhotoPicker";
import { useT } from "@/components/LocaleProvider";
import { addPostComment } from "@/app/(public)/communities/postActions";

/**
 * Форма комментария к теме — и ответа на комментарий (то же поле, тот же
 * экшен, разница только в скрытом `parentId`).
 *
 * Клиентская, а не голый `<form action>`, ради двух вещей, и обе про
 * картинки:
 *
 * 1. после удачной отправки поле надо очистить, а выбор картинок —
 *    пересоздать. `form.reset()` возвращает в исходное только поля
 *    браузера; адреса уже загруженных файлов живут в состоянии
 *    `CommentPhotoPicker`, и без пересоздания следующий комментарий
 *    уехал бы с теми же фотографиями;
 * 2. ошибку экшена надо показать под полем: текст исключения из server
 *    action в проде до клиента не доезжает, поэтому ошибки приезжают
 *    значением (см. docs/architecture.md).
 *
 * Отправленный ОТВЕТ закрывает свою свёртку (правка владельца
 * 2026-09-09): раньше форма оставалась открытой, и на длинной ветке под
 * репликами копились пустые поля ответа — по одному на каждую, куда
 * человек успел написать.
 */
export default function PostCommentForm({
  postId,
  parentId,
  placeholder,
  ariaLabel,
  rows = 3,
}: {
  postId: string;
  /** Ответ в тред. Пусто — комментарий первого уровня. */
  parentId?: string;
  placeholder: string;
  ariaLabel: string;
  rows?: number;
}) {
  const t = useT();
  const s = t.communities.posts;
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickerKey, setPickerKey] = useState(0);

  return (
    <form
      ref={formRef}
      className="d-flex flex-column gap-2"
      action={async (formData) => {
        setError(null);
        const result = await addPostComment(postId, formData);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        formRef.current?.reset();
        setPickerKey((k) => k + 1);
        // Форма ответа живёт в <details> (см. PostComment) — закрываем её
        // руками через DOM, потому что состоянием свёртки владеет
        // разметка ответа, а не эта форма. У комментария первого уровня
        // никакой свёртки нет, `closest` вернёт null и ничего не случится.
        formRef.current?.closest("details")?.removeAttribute("open");
      }}
    >
      {parentId && <input type="hidden" name="parentId" value={parentId} />}
      <textarea
        name="text"
        rows={rows}
        required
        maxLength={3000}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="form-control"
      />
      {error && <p className="small text-danger mb-0">{error}</p>}
      {/* Картинки уезжают на сервер сразу при выборе, форме остаются
          только адреса скрытыми полями (см. CommentPhotoPicker). Кнопка
          «Отправить» отдана пикеру слотом: скрепка и отправка стоят одной
          строкой, скрепка слева (правка владельца 2026-09-09). */}
      <CommentPhotoPicker
        key={pickerKey}
        trailing={
          <button type="submit" className="btn btn-primary btn-sm">
            {s.send}
          </button>
        }
      />
    </form>
  );
}
