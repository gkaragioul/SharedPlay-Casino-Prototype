"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatCredits } from "@/lib/format";

const SUGGESTED = [100, 250, 500, 1000] as const;

export function NewSessionForm({
  games,
  defaultGame,
  balance,
}: {
  games: { id: string; slug: string; name: string }[];
  defaultGame: string;
  balance: number;
}) {
  const router = useRouter();
  const [gameSlug, setGameSlug] = useState(defaultGame || games[0]?.slug || "");
  const [contribution, setContribution] = useState(500);
  const [maxParticipants, setMaxParticipants] = useState(4);
  const [demoBot, setDemoBot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function create() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameSlug, contribution, maxParticipants, demoBot }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create session.");
        return;
      }
      router.push(`/sessions/${data.sessionId}`);
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="label" htmlFor="game">
          Game
        </label>
        <select
          id="game"
          className="input mt-1.5"
          value={gameSlug}
          onChange={(e) => setGameSlug(e.target.value)}
        >
          {games.map((game) => (
            <option key={game.id} value={game.slug}>
              {game.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">Your contribution</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {SUGGESTED.map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => setContribution(amount)}
              className={`chip ${contribution === amount ? "chip-active" : ""}`}
            >
              {amount}
            </button>
          ))}
          <input
            type="number"
            min={10}
            max={Math.min(balance, 100000)}
            value={contribution}
            onChange={(e) => setContribution(Number(e.target.value))}
            className="input w-28 py-2 text-sm"
          />
        </div>
        <p className="mt-2 text-xs text-stone-600">
          Balance {formatCredits(balance)} · minimum 10
        </p>
      </div>

      <div>
        <label className="label" htmlFor="seats">
          Max players
        </label>
        <select
          id="seats"
          className="input mt-1.5"
          value={maxParticipants}
          onChange={(e) => setMaxParticipants(Number(e.target.value))}
        >
          {[2, 3, 4, 5, 6, 7, 8].map((n) => (
            <option key={n} value={n}>
              {n} seats
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-ink-900/60 p-4">
        <input
          type="checkbox"
          checked={demoBot}
          onChange={(e) => setDemoBot(e.target.checked)}
          className="mt-1 h-4 w-4 accent-gold-500"
        />
        <span>
          <span className="text-sm font-semibold text-stone-200">Investor demo bot</span>
          <span className="mt-0.5 block text-xs text-stone-500">
            A simulated friend joins, votes and triggers the ZEUS POWER team bonus.
            Labelled script — not honest RNG play.
          </span>
        </span>
      </label>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <button
        type="button"
        onClick={create}
        disabled={loading || contribution < 10 || contribution > balance}
        className="btn-gold w-full py-3 text-sm"
      >
        {loading ? "Opening…" : `Open table · ${contribution} credits`}
      </button>
    </div>
  );
}
