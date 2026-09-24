import Link from "next/link";
import { requireSessionUser } from "@/lib/auth";
import { prisma } from "@sharedplay/db";
import { formatCredits, formatTimeAgo } from "@/lib/format";

export default async function SessionsPage() {
  const user = await requireSessionUser();

  const sessions = await prisma.sharedSession.findMany({
    where: { participants: { some: { userId: user.id } } },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: {
      game: { select: { name: true, slug: true } },
      host: { select: { displayName: true } },
      participants: { select: { userId: true, leftAt: true } },
    },
  });

  return (
    <div className="mx-auto min-h-dvh max-w-4xl px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/lobby" className="text-sm text-stone-500 hover:text-gold-300">
            ← Lobby
          </Link>
          <h1 className="mt-3 font-display text-3xl font-bold text-stone-100">My sessions</h1>
        </div>
        <Link href="/sessions/new" className="btn-gold px-5 py-2.5 text-sm">
          New session
        </Link>
      </div>

      {sessions.length === 0 ? (
        <div className="panel mt-8 p-10 text-center">
          <p className="text-stone-400">Nothing here yet.</p>
          <Link href="/sessions/new" className="btn-gold mt-4 px-6 py-2.5 text-sm">
            Open your first table
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          {sessions.map((session) => {
            const active = session.participants.filter((p) => !p.leftAt).length;
            const profit = session.currentBankroll - session.initialBankroll;
            return (
              <Link
                key={session.id}
                href={`/sessions/${session.id}`}
                className="panel flex items-center justify-between p-5 transition-all hover:border-gold-500/40"
              >
                <div className="flex items-center gap-4">
                  <span className="font-mono text-sm tracking-widest text-gold-400">
                    {session.code}
                  </span>
                  <div>
                    <p className="font-display font-semibold text-stone-100">
                      {session.game.name}
                    </p>
                    <p className="text-xs text-stone-500">
                      Host {session.host.displayName} · {active} players ·{" "}
                      {formatTimeAgo(session.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className={`text-xs font-bold uppercase tracking-wider ${
                      session.status === "ACTIVE"
                        ? "text-lucky-400"
                        : session.status === "CLOSED"
                          ? "text-stone-500"
                          : "text-gold-300"
                    }`}
                  >
                    {session.status}
                  </p>
                  <p className="mt-1 font-display text-sm font-semibold text-stone-300">
                    {formatCredits(session.currentBankroll)}
                    <span className={`ml-2 text-xs ${profit >= 0 ? "text-lucky-400" : "text-danger"}`}>
                      {profit >= 0 ? "+" : ""}
                      {profit}
                    </span>
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
