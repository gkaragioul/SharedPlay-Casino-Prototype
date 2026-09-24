import Link from "next/link";
import { requireSessionUser } from "@/lib/auth";
import { prisma } from "@sharedplay/db";
import { formatCredits } from "@/lib/format";
import { LogoutButton } from "@/components/logout-button";
import { GameArt } from "@/components/site/game-art";
import { SymbolArt, SymbolDefs } from "@/components/slot/symbols";

const PLAYABLE = new Set(["temple-of-zeus"]);

const CATEGORIES = [
  { label: "Lobby", icon: "🏛️", active: true },
  { label: "Slots", icon: "🎰" },
  { label: "Shared tables", icon: "👥" },
  { label: "Table games", icon: "🎲" },
  { label: "New", icon: "✨" },
  { label: "Popular", icon: "🔥" },
];

const STORIES = [
  { label: "Free spins", symbol: "TEMPLE", ring: true },
  { label: "Zeus Wild", symbol: "ZEUS", ring: true },
  { label: "Lightning", symbol: "LIGHTNING", ring: true },
  { label: "Squads", symbol: "SHIELD", ring: true },
  { label: "Tournament", symbol: "LAUREL", ring: false },
  { label: "Daily bonus", symbol: "COIN", ring: false },
  { label: "Eagle's Eye", symbol: "EAGLE", ring: false },
];

export default async function LobbyPage() {
  const user = await requireSessionUser();

  const [games, recentSessions] = await Promise.all([
    prisma.game.findMany({ orderBy: { name: "asc" } }),
    prisma.sharedSession.findMany({
      where: { participants: { some: { userId: user.id } } },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: {
        game: { select: { name: true, slug: true } },
        host: { select: { displayName: true } },
        participants: { select: { userId: true, leftAt: true } },
      },
    }),
  ]);

  const featured = games.find((g) => g.slug === "temple-of-zeus") ?? games[0];

  return (
    <div className="min-h-dvh bg-[#0b0a14]">
      <SymbolDefs />
      {/* top nav */}
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#0b0a14]/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center gap-6 px-4 py-3 sm:px-6">
          <Link href="/lobby" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-gold-300 to-gold-700 text-lg shadow-gold">
              ⚡
            </span>
            <span className="font-display text-lg font-bold tracking-wide text-stone-100">
              Shared<span className="gold-text">Play</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {["Casino", "Shared tables", "Promotions", "Tournaments"].map((item, i) => (
              <span
                key={item}
                className={`rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider ${
                  i === 0 ? "text-gold-300" : "text-stone-400 hover:text-stone-200"
                }`}
              >
                {item}
              </span>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Demo balance</p>
              <p className="font-display text-base font-bold balance-shine">{formatCredits(user.demoBalance)}</p>
            </div>
            <span className="btn-gold px-4 py-2 text-xs">+ Demo credits</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-gold-500/40 bg-ink-800 text-base">
              {user.avatar ?? "🎰"}
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1500px]">
        {/* sidebar */}
        <aside className="sticky top-[61px] hidden h-[calc(100dvh-61px)] w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r border-white/[0.05] p-4 lg:flex">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-sm text-stone-500">
            🔍 Search games
          </div>
          <nav className="flex flex-col gap-0.5">
            {CATEGORIES.map((c) => (
              <span
                key={c.label}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold ${
                  c.active
                    ? "border-l-2 border-gold-400 bg-gradient-to-r from-gold-500/20 to-transparent text-gold-100"
                    : "text-stone-400 hover:bg-white/[0.04] hover:text-stone-200"
                }`}
              >
                <span>{c.icon}</span>
                {c.label}
              </span>
            ))}
          </nav>
          <div>
            <p className="label px-3">SharedPlay</p>
            <nav className="mt-2 flex flex-col gap-0.5">
              <Link href="/sessions/new" className="rounded-lg px-3 py-2 text-sm font-semibold text-stone-400 hover:bg-white/[0.04] hover:text-stone-200">
                ＋ New shared table
              </Link>
              <Link href="/sessions" className="rounded-lg px-3 py-2 text-sm font-semibold text-stone-400 hover:bg-white/[0.04] hover:text-stone-200">
                👥 My sessions
              </Link>
              <Link href="/games" className="rounded-lg px-3 py-2 text-sm font-semibold text-stone-400 hover:bg-white/[0.04] hover:text-stone-200">
                🎮 All games
              </Link>
            </nav>
          </div>
          <div className="mt-auto space-y-3">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 text-xs text-stone-500">
              Signed in as <span className="text-stone-200">{user.displayName}</span>
            </div>
            <LogoutButton />
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-10 px-4 py-6 sm:px-6">
          {/* hero bento */}
          <section className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
            {featured ? (
              <Link
                href={`/games/${featured.slug}`}
                className="lobby-hero group relative block min-h-[300px] overflow-hidden rounded-2xl border border-white/[0.06] sm:min-h-[340px]"
              >
                <div className="absolute inset-0 transition-transform duration-700 group-hover:scale-[1.04]">
                  <GameArt slug={featured.slug} variant="banner" />
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent sm:via-black/20" />
                {/* On a phone the copy fills the card, so darken it top-up and keep the art in the top band. */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent sm:hidden" />
                <div className="relative flex h-full max-w-[60%] flex-col justify-end p-6 sm:p-8 max-sm:max-w-full">
                  <span className="mb-3 w-fit rounded-full border border-gold-400/50 bg-black/40 px-3 py-1 text-[10px] font-bold uppercase tracking-luxe text-gold-200">
                    Featured · new
                  </span>
                  <h1 className="font-display text-4xl font-black leading-none text-white drop-shadow-lg sm:text-5xl">
                    {featured.name}
                  </h1>
                  <p className="mt-3 max-w-sm text-sm text-stone-200/90 sm:text-base">
                    Summon Zeus wilds, land three temples for free spins with multipliers, and chase the Epic Win.
                  </p>
                  <span className="btn-gold mt-5 w-fit px-7 py-3 text-sm transition-transform group-hover:translate-x-1">
                    ▶ Play now
                  </span>
                </div>
              </Link>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <PromoCard tone="from-[#7a1025] to-[#2a0610]" symbol="TEMPLE" title="Free spins" text="3 temples · up to ×3" />
              <PromoCard tone="from-[#123a8a] to-[#081534]" symbol="LIGHTNING" title="Turbo mode" text="Fast spins, same odds" />
              <PromoCard tone="from-[#1f5b33] to-[#081f10]" symbol="SHIELD" title="Shared tables" text="Pool credits with friends" href="/sessions/new" />
              <PromoCard tone="from-[#5b2ea8] to-[#1a0b3d]" symbol="COIN" title="10,000 demo" text="Credits on the house" />
            </div>
          </section>

          {/* stories */}
          <section className="no-scrollbar -mx-1 flex gap-5 overflow-x-auto px-1 pb-1">
            {STORIES.map((s) => (
              <div key={s.label} className="flex w-[84px] shrink-0 flex-col items-center gap-2">
                <div
                  className={`story-ring flex h-[76px] w-[76px] items-center justify-center rounded-full p-[3px] ${
                    s.ring ? "bg-gradient-to-tr from-gold-600 via-gold-300 to-[#e0405a]" : "bg-white/15"
                  }`}
                >
                  <div className="flex h-full w-full items-center justify-center rounded-full bg-[#15112a]">
                    <SymbolArt id={s.symbol} className="h-[78%] w-[78%]" />
                  </div>
                </div>
                <span className="w-full truncate text-center text-xs font-semibold text-stone-300">{s.label}</span>
              </div>
            ))}
          </section>

          {/* games rail */}
          <section>
            <div className="mb-4 flex items-end justify-between">
              <h2 className="font-display text-xl font-bold text-stone-100">Popular games</h2>
              <Link href="/games" className="text-xs font-bold uppercase tracking-wider text-gold-300 hover:text-gold-200">
                See all ›
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
              {games.map((game) => {
                const playable = PLAYABLE.has(game.slug);
                return (
                  <Link
                    key={game.id}
                    href={`/games/${game.slug}`}
                    className="game-tile group relative block aspect-[3/4] overflow-hidden rounded-2xl border border-white/[0.07]"
                  >
                    <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-110">
                      <GameArt slug={game.slug} />
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
                    {playable ? (
                      <span className="absolute left-2 top-2 rounded-md bg-[#e0405a] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                        New
                      </span>
                    ) : (
                      <span className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-stone-300">
                        Soon
                      </span>
                    )}
                    <div className="absolute inset-x-0 bottom-0 p-3">
                      <p className="font-display text-lg font-black leading-tight text-white drop-shadow">{game.name}</p>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                        SharedPlay Studio · {game.type.toLowerCase()}
                      </p>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gold-sheen text-xl text-ink-950 shadow-gold">
                        ▶
                      </span>
                    </div>
                  </Link>
                );
              })}
              {["Aegean Riches", "Medusa's Gaze", "Athena's Owl"].map((name, i) => (
                <div key={name} className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-white/[0.05] bg-gradient-to-b from-[#1d1740] to-[#0b0a14]">
                  <div className="absolute inset-0 flex items-center justify-center opacity-30 grayscale">
                    <SymbolArt id={["EAGLE", "SHIELD", "LAUREL"][i]!} className="h-1/2 w-1/2" />
                  </div>
                  <span className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-stone-400">
                    Coming soon
                  </span>
                  <div className="absolute inset-x-0 bottom-0 p-3">
                    <p className="font-display text-lg font-black leading-tight text-stone-400">{name}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* sessions */}
          <section>
            <div className="mb-4 flex items-end justify-between">
              <div>
                <h2 className="font-display text-xl font-bold text-stone-100">Your shared tables</h2>
                <p className="text-sm text-stone-500">Play together with a shared bankroll</p>
              </div>
              <Link href="/sessions/new" className="btn-gold px-4 py-2 text-xs">
                New shared table
              </Link>
            </div>

            {recentSessions.length === 0 ? (
              <div className="panel p-8 text-center">
                <p className="text-stone-400">No shared tables yet.</p>
                <p className="mt-1 text-sm text-stone-600">Open a table, invite friends, share the bankroll.</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {recentSessions.map((session) => {
                  const active = session.participants.filter((p) => !p.leftAt);
                  const mine = session.participants.find((p) => p.userId === user.id);
                  return (
                    <Link
                      key={session.id}
                      href={`/sessions/${session.id}`}
                      className="panel p-4 transition-all hover:border-gold-500/40"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs tracking-widest text-gold-400">{session.code}</span>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider ${
                            session.status === "ACTIVE"
                              ? "text-lucky-400"
                              : session.status === "CLOSED"
                                ? "text-stone-500"
                                : "text-gold-300"
                          }`}
                        >
                          {session.status}
                        </span>
                      </div>
                      <p className="mt-2 font-display font-semibold text-stone-100">{session.game.name}</p>
                      <p className="mt-1 text-xs text-stone-500">
                        Host {session.host.displayName} · {active.length} players
                        {mine ? ` · you ${mine.leftAt ? "left" : "in"}` : ""}
                      </p>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          <footer className="border-t border-white/[0.05] pb-12 pt-6 text-xs text-stone-600">
            SharedPlay Casino · prototype · demo credits only · no deposits, withdrawals or real prizes · 18+ play responsibly
          </footer>
        </main>
      </div>
    </div>
  );
}

function PromoCard({
  tone,
  symbol,
  title,
  text,
  href,
}: {
  tone: string;
  symbol: string;
  title: string;
  text: string;
  href?: string;
}) {
  const body = (
    <div className={`group relative h-full min-h-[150px] overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br ${tone} p-4`}>
      <SymbolArt
        id={symbol}
        className="absolute -bottom-3 -right-3 h-24 w-24 transition-transform duration-500 group-hover:-translate-y-1 group-hover:rotate-6 group-hover:scale-110"
      />
      <p className="font-display text-xl font-black text-white">{title}</p>
      <p className="mt-1 max-w-[65%] text-xs text-white/70">{text}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
