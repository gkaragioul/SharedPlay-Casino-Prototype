import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSessionUser } from "@/lib/auth";
import { prisma } from "@sharedplay/db";
import { StartSoloButton } from "@/components/start-solo-button";

export default async function GamesPage() {
  const user = await requireSessionUser();
  const games = await prisma.game.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="mx-auto min-h-dvh max-w-4xl px-6 py-12">
      <Link href="/lobby" className="text-sm text-stone-500 hover:text-gold-300">
        ← Lobby
      </Link>
      <h1 className="mt-4 font-display text-3xl font-bold text-stone-100">Games</h1>
      <p className="mt-1 text-stone-500">
        Signed in as {user.displayName} · demo credits only
      </p>

      <div className="mt-8 space-y-4">
        {games.map((game) => (
          <div key={game.id} className="panel flex items-center justify-between p-6">
            <div>
              <h2 className="font-display text-xl font-semibold text-stone-100">
                {game.name}
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                {game.type}
                {game.multiplayerEnabled ? " · multiplayer ready" : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <StartSoloButton slug={game.slug} />
              <Link href={`/sessions/new?game=${game.slug}`} className="btn-ghost px-4 py-2 text-xs">
                Shared table
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
