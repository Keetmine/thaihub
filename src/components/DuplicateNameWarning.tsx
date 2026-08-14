"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Non-blocking "похожее уже есть" hint below a name field on create forms —
 * debounced live lookup against existing rows. Doesn't stop submission;
 * just helps catch accidental re-entry of something already in the catalog
 * (the kind of thing that produced real duplicate Dramas this session).
 */
export default function DuplicateNameWarning({
  value,
  checkAction,
  editHrefBase,
}: {
  value: string;
  checkAction: (query: string) => Promise<{ id: string; name: string }[]>;
  editHrefBase: string;
}) {
  const [matches, setMatches] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const query = value.trim();
    let cancelled = false;
    const timer = setTimeout(
      async () => {
        // checkAction already returns [] for too-short queries — no need
        // to special-case that here.
        const results = await checkAction(query).catch(() => []);
        if (!cancelled) setMatches(results);
      },
      query.length < 2 ? 0 : 400,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, checkAction]);

  if (matches.length === 0) return null;

  return (
    <p className="small text-warning-emphasis mb-0 mt-1">
      Похоже, уже есть:{" "}
      {matches.map((m, i) => (
        <span key={m.id}>
          {i > 0 && ", "}
          <Link
            href={`${editHrefBase}/${m.id}/edit`}
            target="_blank"
            className="link-warning"
          >
            {m.name}
          </Link>
        </span>
      ))}
    </p>
  );
}
