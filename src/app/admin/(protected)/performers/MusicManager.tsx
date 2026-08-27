"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmForm from "@/components/ConfirmForm";
import SubmitButton from "@/components/admin/SubmitButton";
import LetterAvatar from "@/components/LetterAvatar";
import FileDropzone from "@/components/FileDropzone";
import { PencilIcon, TrashIcon } from "@/components/icons";
import { saveAlbum, deleteAlbum, saveSong, deleteSong } from "./musicActions";

export type AlbumRow = {
  id: string;
  title: string;
  type: string;
  year: number | null;
  coverUrl: string | null;
  url: string | null;
};

export type SongRow = {
  id: string;
  title: string;
  note: string | null;
  year: number | null;
  url: string | null;
  albumId: string | null;
};

/** Вкладка «Музыка» в редакторе исполнителя: альбомы и песни руками
 *  (до этого они появлялись только импортом с tpop.fandom). Каждая
 *  строка правится инлайн, форма добавления — сверху. */
export default function MusicManager({
  performerId,
  albums,
  songs,
}: {
  performerId: string;
  albums: AlbumRow[];
  songs: SongRow[];
}) {
  const uid = useId();
  const router = useRouter();
  const [editingAlbum, setEditingAlbum] = useState<string | null>(null);
  const [editingSong, setEditingSong] = useState<string | null>(null);

  const albumTitle = (id: string | null) =>
    id ? (albums.find((a) => a.id === id)?.title ?? null) : null;

  async function submitAlbum(fd: FormData) {
    await saveAlbum(performerId, fd);
    setEditingAlbum(null);
    router.refresh();
  }

  async function submitSong(fd: FormData) {
    await saveSong(performerId, fd);
    setEditingSong(null);
    router.refresh();
  }

  return (
    <div className="d-flex flex-column gap-3">
      <section className="admin-section">
        <div className="admin-section-head">
          <span className="admin-section-title">Альбомы и EP</span>
          <span className="admin-section-hint">
            {albums.length === 0 ? "пока пусто" : `${albums.length} шт.`}
          </span>
        </div>

        <form action={submitAlbum} className="row g-2 align-items-end mb-3">
          <div className="col-12 col-md-5">
            <label className="form-label small text-secondary" htmlFor={`${uid}-title`}>Название</label>
            <input id={`${uid}-title`} name="title" required placeholder="Название альбома" className="form-control" />
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label small text-secondary" htmlFor={`${uid}-type`}>Тип</label>
            <select id={`${uid}-type`} name="type" className="form-select">
              <option value="ALBUM">Альбом</option>
              <option value="EP">EP</option>
            </select>
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label small text-secondary" htmlFor={`${uid}-year`}>Год</label>
            <input id={`${uid}-year`} name="year" type="number" placeholder="2026" className="form-control" />
          </div>
          <div className="col-12 col-md-3">
            <FileDropzone name="coverUrl" label="Обложка" />
          </div>
          <div className="col-12">
            <SubmitButton label="+ Добавить альбом" busyLabel="Сохраняем…" />
          </div>
        </form>

        {albums.length > 0 && (
          <div className="d-flex flex-column gap-2">
            {albums.map((a) =>
              editingAlbum === a.id ? (
                <form key={a.id} action={submitAlbum} className="row g-2 align-items-end surface p-2">
                  <input type="hidden" name="albumId" value={a.id} />
                  <div className="col-12 col-md-3">
                    <FileDropzone name="coverUrl" label="Обложка" defaultValue={a.coverUrl ?? ""} />
                  </div>
                  <div className="col-12 col-md-3">
                    <input name="title" required defaultValue={a.title} placeholder="Название" aria-label="Название альбома" className="form-control form-control-sm" />
                  </div>
                  <div className="col-6 col-md-2">
                    <select name="type" defaultValue={a.type} aria-label="Тип релиза" className="form-select form-select-sm">
                      <option value="ALBUM">Альбом</option>
                      <option value="EP">EP</option>
                    </select>
                  </div>
                  <div className="col-6 col-md-2">
                    <input name="year" type="number" defaultValue={a.year ?? ""} placeholder="Год" aria-label="Год выхода" className="form-control form-control-sm" />
                  </div>
                  <div className="col-12 col-md-3">
                    <input name="url" defaultValue={a.url ?? ""} placeholder="Ссылка на площадку" aria-label="Ссылка на площадку" className="form-control form-control-sm" />
                  </div>
                  <div className="col-12 col-md-1 d-flex gap-1">
                    <SubmitButton label="✓" ariaLabel="Сохранить" />
                    <button type="button" className="btn btn-ghost btn-sm" aria-label="Отменить правку" title="Отменить правку" onClick={() => setEditingAlbum(null)}>×</button>
                  </div>
                </form>
              ) : (
                <div key={a.id} className="surface d-flex align-items-center gap-3 p-2 px-3">
                  <LetterAvatar name={a.title} photoUrl={a.coverUrl} size={2.25} rounded={false} />
                  <div style={{ minWidth: 0 }}>
                    <span className="d-block text-white text-truncate">{a.title}</span>
                    <span className="small text-secondary">
                      {a.type === "EP" ? "EP" : "Альбом"}
                      {a.year && ` · ${a.year}`}
                      {a.url && " · есть ссылка"}
                    </span>
                  </div>
                  <div className="d-flex align-items-center gap-2 ms-auto flex-shrink-0">
                    <button type="button" className="icon-btn" aria-label="Редактировать" onClick={() => setEditingAlbum(a.id)}>
                      <PencilIcon />
                    </button>
                    <ConfirmForm
                      action={async () => {
                        await deleteAlbum(performerId, a.id);
                        router.refresh();
                      }}
                      confirmMessage={`Удалить альбом «${a.title}»?`}
                    >
                      <button type="button" className="icon-btn icon-btn-danger" aria-label="Удалить">
                        <TrashIcon />
                      </button>
                    </ConfirmForm>
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </section>

      <section className="admin-section">
        <div className="admin-section-head">
          <span className="admin-section-title">Песни и синглы</span>
          <span className="admin-section-hint">
            {songs.length === 0 ? "пока пусто" : `${songs.length} шт.`}
          </span>
        </div>

        <form action={submitSong} className="row g-2 align-items-end mb-3">
          <div className="col-12 col-md-4">
            <label className="form-label small text-secondary" htmlFor={`${uid}-title2`}>Название</label>
            <input id={`${uid}-title2`} name="title" required placeholder="Название песни" className="form-control" />
          </div>
          <div className="col-12 col-md-3">
            <label className="form-label small text-secondary" htmlFor={`${uid}-note`}>Пояснение</label>
            <input id={`${uid}-note`} name="note" placeholder="OST, «with …»" className="form-control" />
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label small text-secondary" htmlFor={`${uid}-year2`}>Год</label>
            <input id={`${uid}-year2`} name="year" type="number" placeholder="2026" className="form-control" />
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small text-secondary" htmlFor={`${uid}-albumId`}>Альбом</label>
            <select id={`${uid}-albumId`} name="albumId" className="form-select">
              <option value="">Сингл</option>
              {albums.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
          </div>
          <div className="col-12">
            <SubmitButton label="+ Добавить песню" busyLabel="Сохраняем…" />
          </div>
        </form>

        {songs.length > 0 && (
          <div className="d-flex flex-column gap-2">
            {songs.map((s) =>
              editingSong === s.id ? (
                <form key={s.id} action={submitSong} className="row g-2 align-items-end surface p-2">
                  <input type="hidden" name="songId" value={s.id} />
                  <div className="col-12 col-md-3">
                    <input name="title" required defaultValue={s.title} placeholder="Название" aria-label="Название песни" className="form-control form-control-sm" />
                  </div>
                  <div className="col-12 col-md-3">
                    <input name="note" defaultValue={s.note ?? ""} placeholder="Пояснение" aria-label="Пояснение к песне" className="form-control form-control-sm" />
                  </div>
                  <div className="col-4 col-md-1">
                    <input name="year" type="number" defaultValue={s.year ?? ""} placeholder="Год" aria-label="Год выхода" className="form-control form-control-sm" />
                  </div>
                  <div className="col-8 col-md-2">
                    <select name="albumId" defaultValue={s.albumId ?? ""} aria-label="В каком альбоме" className="form-select form-select-sm">
                      <option value="">Сингл</option>
                      {albums.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-12 col-md-2">
                    <input name="url" defaultValue={s.url ?? ""} placeholder="Ссылка" aria-label="Ссылка на песню" className="form-control form-control-sm" />
                  </div>
                  <div className="col-12 col-md-1 d-flex gap-1">
                    <SubmitButton label="✓" ariaLabel="Сохранить" />
                    <button type="button" className="btn btn-ghost btn-sm" aria-label="Отменить правку" title="Отменить правку" onClick={() => setEditingSong(null)}>×</button>
                  </div>
                </form>
              ) : (
                <div key={s.id} className="surface d-flex align-items-center gap-3 p-2 px-3">
                  <div style={{ minWidth: 0 }}>
                    <span className="d-block text-white text-truncate">
                      {s.title}
                      {s.note && <span className="small text-secondary"> · {s.note}</span>}
                    </span>
                    <span className="small text-secondary">
                      {albumTitle(s.albumId) ?? "сингл"}
                      {s.year && ` · ${s.year}`}
                    </span>
                  </div>
                  <div className="d-flex align-items-center gap-2 ms-auto flex-shrink-0">
                    <button type="button" className="icon-btn" aria-label="Редактировать" onClick={() => setEditingSong(s.id)}>
                      <PencilIcon />
                    </button>
                    <ConfirmForm
                      action={async () => {
                        await deleteSong(performerId, s.id);
                        router.refresh();
                      }}
                      confirmMessage={`Удалить песню «${s.title}»?`}
                    >
                      <button type="button" className="icon-btn icon-btn-danger" aria-label="Удалить">
                        <TrashIcon />
                      </button>
                    </ConfirmForm>
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </section>
    </div>
  );
}
