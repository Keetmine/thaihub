"use client";

import type { ComponentProps } from "react";
import FileDropzone from "@/components/FileDropzone";
import { useSettingsUploading } from "./SettingsForm";

/**
 * Поле загрузки картинки внутри формы настроек — та же общая
 * `FileDropzone`, но с подключённым `onUploadingChange`.
 *
 * Нужна прослойка потому, что страница настроек серверная: свой колбэк
 * она дропзоне передать не может, а без него «Сохранить» можно нажать,
 * пока файл ещё едет, — поле в этот момент пустое, и сохранение стёрло
 * бы прежнюю картинку молча, без единой ошибки. Ровно эту грабль чинили
 * в формах сообществ (аудит 2026-09, п.1.6).
 */
export default function SettingsUploadField(
  props: Omit<ComponentProps<typeof FileDropzone>, "onUploadingChange">,
) {
  const setUploading = useSettingsUploading();
  return <FileDropzone {...props} onUploadingChange={setUploading} />;
}
