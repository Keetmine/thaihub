"use server";

import { revalidatePath } from "next/cache";
import {
  previewTmdbPersonImport,
  commitTmdbPersonImport,
  type TmdbImportPreview,
  type TmdbImportResult,
} from "@/lib/tmdbImport";
import { parseTmdbPersonId } from "@/lib/tmdb";

export type { TmdbImportPreview, TmdbImportResult };

export async function previewTmdbImport(input: string): Promise<TmdbImportPreview> {
  const personId = parseTmdbPersonId(input);
  if (!personId) {
    throw new Error("Не удалось распознать TMDB id — вставьте ссылку вида themoviedb.org/person/12345 или сам id");
  }
  return previewTmdbPersonImport(personId);
}

export async function commitTmdbImport(input: {
  performerId: string;
  tmdbPersonId: string;
  placeOfBirth: string;
  selectedTvIds: number[];
}): Promise<TmdbImportResult> {
  const result = await commitTmdbPersonImport(input);
  revalidatePath(`/admin/performers/${input.performerId}/edit`);
  revalidatePath("/admin/performers");
  revalidatePath("/admin/dramas");
  revalidatePath("/performers");
  revalidatePath("/dramas");
  return result;
}
