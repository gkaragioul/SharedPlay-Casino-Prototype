"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { GameView, TempleOfZeusView } from "@sharedplay/types";
import { formatCredits } from "@/lib/format";

const BET_LEVELS = [1, 2, 5, 10, 20, 50] as const;

interface SpinResponse {
  bankroll: number;
  payout: number;
  bonusTriggered: boolean;
  view: GameView;
  bet: number;
}

export function TempleClient({
  gameSlug,
  gameName,
  startBalance,
  userId,
  supported,
}: {
  gameSlug: string;
  gameName: string;
  startBalance: number;
  userId: string;
  supported: boolean;
}) {
  const [balance, setBalance] = useState(startBalance);
  const [bet, setBet] = useState(10);
  const [view, setView] = useState<TempleOfZeusView | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastWin, setLastWin] = useState(0);

  const temple = useMemo(() => {
    if (!view || view.game !== "temple-of-zeus") return null;
    return view;
  }, [view]);

  async function spin() {
    if (spinning) return;
    setSpinning(true);
    setError(null);
    try {
      const res = await fetch("/api/solo/spin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: gameSlug, bet }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Spin failed.");
        return;
      }
      const payload = data as SpinResponse;
      setBalance(payload.bankroll);
      setLastWin(payload.payout);
      if (payload.view && payload.view.game === "temple-of-zeus") {
        setView(payload.view);
      }
    } catch {
      setError("Network error — try again.");
    } finally {
      setSpinning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/lobby" className="text-sm text-stone-500 hover:text-gold-300">
            ← Lobby
          </Link>
          <h1 className="font-display text-2xl font-bold text-stone-100">{gameName}</h1>
          <span className="chip">Solo</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="label">Balance</span>
          <span className="font-display text-lg font-bold balance-shine">
            {formatCredits(balance)}
          </span>
        </div>
      </div>

      {!supported ? (
        <div className="panel p-10 text-center">
          <p className="text-stone-300">
            This title is in the catalogue but the engine isn&apos;t wired yet.
          </p>
          <p className="mt-2 text-sm text-stone-600">Temple of Zeus is fully playable.</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <div className="panel relative overflow-hidden p-6">
            <div className="absolute inset-0 bg-felt-dark opacity-60 pointer-events-none" />
            <div className="relative">
              <div className="flex items-center justify-between">
                <div>
                  <p className="label text-gold-500/70">Temple of Zeus</p>
                  <p className="mt-1 text-sm text-stone-500">5 reels · 20 lines · demo credits</p>
                </div>
                {temple ? (
                  <div className="text-right">
                    <p className="label">Last win</p>
                    <p className="font-display text-xl font-bold text-lucky-400">
                      {formatCredits(lastWin)}
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="mt-6 grid grid-cols-5 gap-2">
                {Array.from({ length: 5 }, (_, reel) => {
                  const column = temple?.reels[reel] ?? [];
                  return (
                    <div
                      key={reel}
                      className="flex flex-col gap-2 rounded-xl border border-white/[0.06] bg-ink-900/80 p-2"
                    >
                      {Array.from({ length: 3 }, (_, row) => (
                        <div
                          key={row}
                          className={`flex aspect-square items-center justify-center rounded-lg bg-ink-800 text-2xl transition-all sm:text-3xl ${
                            spinning ? "animate-pulse" : ""
                          }`}
                        >
                          {column[row] ? symbolEmoji(column[row]!) : "·"}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>

              {temple?.lastLines?.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {temple.lastLines.map((line) => (
                    <span key={`${line.line}-${line.symbol}`} className="chip chip-active text-[10px]">
                      Line {line.line} · {line.symbol} ×{line.count} · +{line.payout}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="label">Bet</span>
                  {BET_LEVELS.map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setBet(level)}
                      className={`chip ${bet === level ? "chip-active" : ""}`}
                      disabled={spinning}
                    >
                      {level}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={spin}
                  disabled={spinning || balance < bet}
                  className="btn-gold ml-auto px-10 py-3 text-sm"
                >
                  {spinning ? "Spinning…" : `Spin ${bet}`}
                </button>
              </div>

              {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

              <p className="mt-4 text-xs text-stone-600">
                Solo rounds are server-resolved with the same engine the shared
                tables use. No real money.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="panel p-5">
              <p className="label text-gold-500/70">Shared table</p>
              <p className="mt-2 text-sm text-stone-400">
                Pool credits with friends, rotate control, vote on big bets and
                the bonus path.
              </p>
              <Link
                href={`/sessions/new?game=${gameSlug}`}
                className="btn-ghost mt-4 w-full py-2.5 text-xs"
              >
                Open shared session
              </Link>
            </div>

            <div className="panel p-5">
              <p className="label text-gold-500/70">How it works</p>
              <ul className="mt-3 space-y-2 text-xs leading-relaxed text-stone-500">
                <li>· Server decides every outcome (RNG on the server).</li>
                <li>· Shared bankrolls use integer credits + hash-chained ledger.</li>
                <li>· Large bets and cash-outs can require a group vote.</li>
                <li>· You are signed in as <span className="text-stone-300">{userId.slice(0, 8)}…</span></li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function symbolEmoji(symbol: string): string {
  switch (symbol) {
    case "ZEUS":
      return "⚡";
    case "LIGHTNING":
      return "🌩️";
    case "EAGLE":
      return "🦅";
    case "SHIELD":
      return "🛡️";
    case "LAUREL":
      return "🌿";
    case "COIN":
      return "🪙";
    case "ACE":
      return "A";
    case "KING":
      return "K";
    case "QUEEN":
      return "Q";
    case "JACK":
      return "J";
    case "TEMPLE":
      return "🏛️";
    default:
      return symbol;
  }
}
