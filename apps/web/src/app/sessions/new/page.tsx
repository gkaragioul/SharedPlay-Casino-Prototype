import Link from "next/link";
import { requireSessionUser } from "@/lib/auth";
import { prisma } from "@sharedplay/db";
import { listGameSlugs } from "@sharedplay/games";
import { NewSessionForm } from "./new-session-form";

export default async function NewSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  const user = await requireSessionUser();
  const { game } = await searchParams;
  // Only offer games that have a working engine (roulette is still a placeholder).
  const playable = new Set(listGameSlugs());
  const games = (await prisma.game.findMany({ orderBy: { name: "asc" } })).filter((g) => playable.has(g.slug));

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-6 py-12">
      <Link href="/lobby" className="text-sm text-stone-500 hover:text-gold-300">
        ← Lobby
      </Link>
      <h1 className="mt-4 font-display text-3xl font-bold text-stone-100">
        Open a shared table
      </h1>
      <p className="mt-2 text-sm text-stone-500">
        You contribute demo credits, invite friends, and share one bankroll.
        Control rotates; big decisions can go to a vote.
      </p>

      <div className="panel mt-8 p-6">
        <NewSessionForm
          games={games.map((g) => ({ id: g.id, slug: g.slug, name: g.name }))}
          defaultGame={games.some((g) => g.slug === game) ? game! : games[0]?.slug ?? ""}
          balance={user.demoBalance}
        />
      </div>
    </div>
  );
}
