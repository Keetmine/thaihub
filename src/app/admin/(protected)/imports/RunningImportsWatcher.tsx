"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Пока на странице есть импорт в статусе RUNNING — обновляем её каждые
 *  4 секунды, чтобы прогресс (run.summary) и лента «последнего
 *  спарсенного» шли живьём без ручного рефреша. */
export default function RunningImportsWatcher({ hasRunning }: { hasRunning: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!hasRunning) return;
    const id = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(id);
  }, [hasRunning, router]);
  return null;
}
