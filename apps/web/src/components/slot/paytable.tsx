"use client";

import {
  LINES,
  LINE_PAYS,
  PAYOUT_SCALE,
  SCATTER_PAYS,
} from "@sharedplay/games/temple-of-zeus/paytable";
import { SYMBOL_LABELS, SymbolArt } from "./symbols";

const ORDER = ["ZEUS", "LIGHTNING", "EAGLE", "SHIELD", "LAUREL", "COIN", "ACE", "KING", "QUEEN", "JACK"];

/** Paytable in credits for the chosen total bet (values mirror the server engine). */
export function Paytable({ onClose, bet }: { onClose: () => void; bet: number }) {
  const pay = (mult: number) => Math.floor(mult * (bet / LINES) * PAYOUT_SCALE);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="paytable-card max-h-[88dvh] w-full max-w-3xl overflow-y-auto animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="label text-gold-400/80">Paytable · bet {bet}</p>
            <h2 className="font-display text-2xl font-bold text-stone-100">Temple of Zeus</h2>
          </div>
          <button type="button" onClick={onClose} className="slot-icon-btn" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="pay-feature">
            <SymbolArt id="ZEUS" className="h-16 w-16 shrink-0" />
            <div>
              <p className="font-display text-lg font-bold text-gold-200">Zeus · Wild</p>
              <p className="text-xs text-stone-400">Substitutes for every symbol except the Temple.</p>
            </div>
          </div>
          <div className="pay-feature">
            <SymbolArt id="TEMPLE" className="h-16 w-16 shrink-0" />
            <div>
              <p className="font-display text-lg font-bold text-gold-200">Temple · Scatter</p>
              <p className="text-xs text-stone-400">
                3+ anywhere pay {pay(SCATTER_PAYS[3] ?? 0)} / {pay(SCATTER_PAYS[4] ?? 0)} / {pay(SCATTER_PAYS[5] ?? 0)} and
                trigger <span className="text-gold-200">free spins with a multiplier</span>.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {ORDER.map((id) => {
            const row = LINE_PAYS[id as keyof typeof LINE_PAYS] ?? {};
            return (
              <div key={id} className="pay-cell">
                <SymbolArt id={id} className="mx-auto h-14 w-14" />
                <p className="mt-1 text-center text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                  {SYMBOL_LABELS[id]}
                </p>
                <div className="mt-1 space-y-0.5 text-center font-mono text-xs">
                  {[5, 4, 3].map((n) => (
                    <p key={n}>
                      <span className="text-stone-500">{n}×</span>{" "}
                      <span className="text-gold-200">{pay(row[n] ?? 0)}</span>
                    </p>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 rounded-xl border border-white/5 bg-black/20 p-4 text-xs leading-relaxed text-stone-400">
          <p>
            Free spins: the gods pick the <span className="text-stone-200">Lightning Path</span> (6 spins, ×3) or
            the <span className="text-stone-200">Shield Path</span> (8 spins, ×2). At a shared table, Lightning
            symbols also charge the team ZEUS POWER meter.
          </p>
          <p className="mt-2">
            20 fixed lines pay left to right from the first reel. Every outcome is decided on the server; the
            animation only reveals it. Demo credits only — no real money, no prizes.
          </p>
        </div>
      </div>
    </div>
  );
}
