"use client";

import { useRouter } from "next/navigation";

export function StartSoloButton({ slug }: { slug: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      className="btn-gold px-4 py-2 text-xs"
      onClick={() => router.push(`/games/${slug}`)}
    >
      Play solo
    </button>
  );
}
