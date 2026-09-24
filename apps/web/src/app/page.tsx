import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { GameArt } from "@/components/site/game-art";
import { SymbolArt, SymbolDefs } from "@/components/slot/symbols";

const FEATURES = [
  {
    symbol: "ZEUS",
    title: "Zeus is wild",
    text: "The king of the gods stands in for every symbol except the temple.",
  },
  {
    symbol: "TEMPLE",
    title: "Free spins",
    text: "Three temples anywhere open the heavens: up to 8 free spins at up to ×3.",
  },
  {
    symbol: "SHIELD",
    title: "Play together",
    text: "Pool demo credits with friends, take turns spinning, vote on the bonus.",
  },
];

export default async function HomePage() {
  const user = await getSessionUser();
  if (user) redirect("/lobby");

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#07050f]">
      <SymbolDefs />
      {/* nav */}
      <header className="relative z-20 mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-gold-300 to-gold-700 text-lg shadow-gold">
            ⚡
          </span>
          <span className="font-display text-lg font-bold tracking-wide text-stone-100">
            Shared<span className="gold-text">Play</span>
          </span>
        </span>
        <div className="flex items-center gap-3">
          <Link href="/login" className="btn-ghost px-5 py-2 text-xs">
            Sign in
          </Link>
          <Link href="/signup" className="btn-gold px-5 py-2 text-xs">
            Join free
          </Link>
        </div>
      </header>

      {/* hero */}
      <section className="relative mx-auto grid max-w-6xl items-center gap-10 px-6 pb-16 pt-6 lg:grid-cols-[1.1fr_1fr] lg:pt-12">
        <div className="landing-glow pointer-events-none absolute -left-40 -top-40 h-[600px] w-[600px] rounded-full" />
        <div className="relative animate-fade-up">
          <p className="label mb-4 text-gold-400/90">New slot · Temple of Zeus</p>
          <h1 className="font-display text-5xl font-black leading-[0.95] tracking-tight text-stone-50 sm:text-7xl">
            Spin with the <span className="gold-text">gods</span>.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-stone-400">
            Lightning-fast reels, thunderous free spins and wins that shake the temple. Play solo, or bring your
            friends to a shared table.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link href="/login" className="btn-gold landing-cta px-9 py-4 text-base">
              ▶ Play Temple of Zeus
            </Link>
            <Link href="/signup" className="btn-ghost px-7 py-4 text-sm">
              Create account
            </Link>
          </div>
          <p className="mt-6 text-sm text-stone-500">
            Demo accounts: <span className="font-mono text-gold-300">george / nick / alex / helen</span> · password{" "}
            <span className="font-mono text-gold-300">demo1234</span>
          </p>
        </div>

        <Link
          href="/login"
          className="landing-poster group relative mx-auto block aspect-[4/5] w-full max-w-md overflow-hidden rounded-[28px] border border-gold-500/30 shadow-[0_40px_120px_-30px_rgba(157,108,240,0.7)] animate-scale-in"
        >
          <div className="absolute inset-0 transition-transform duration-700 group-hover:scale-105">
            <GameArt slug="temple-of-zeus" variant="hero" />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6">
            <p className="font-display text-3xl font-black text-white">Temple of Zeus</p>
            <p className="mt-1 text-xs font-bold uppercase tracking-luxe text-gold-200/80">5 reels · 20 lines · free spins</p>
          </div>
        </Link>
      </section>

      {/* symbol marquee */}
      <section className="relative border-y border-white/[0.05] bg-white/[0.02] py-5">
        <div className="landing-marquee flex w-max gap-10">
          {[0, 1].map((k) => (
            <div key={k} className="flex gap-10" aria-hidden={k === 1}>
              {["ZEUS", "LIGHTNING", "TEMPLE", "EAGLE", "SHIELD", "LAUREL", "COIN", "ACE", "KING", "QUEEN", "JACK"].map((id) => (
                <SymbolArt key={`${k}-${id}`} id={id} className="h-16 w-16 shrink-0" />
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* features */}
      <section className="mx-auto grid max-w-6xl gap-5 px-6 py-16 md:grid-cols-3">
        {FEATURES.map((f, i) => (
          <div
            key={f.title}
            className="panel group p-6 transition-all hover:-translate-y-1 hover:border-gold-500/40 animate-fade-up"
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <SymbolArt id={f.symbol} className="h-20 w-20 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3" />
            <h3 className="mt-4 font-display text-xl font-bold text-stone-100">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-stone-400">{f.text}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-white/[0.05] px-6 py-8 text-center text-xs text-stone-600">
        SharedPlay Casino · prototype · demo credits only — no deposits, withdrawals or real prizes · 18+
      </footer>
    </main>
  );
}
