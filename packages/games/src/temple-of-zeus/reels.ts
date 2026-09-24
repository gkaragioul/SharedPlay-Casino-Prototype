import type { Rng } from "../rng";
import { SCATTER_SYMBOL, type TempleSymbol, SYMBOLS, WILD_SYMBOL } from "./symbols";

export const REEL_COUNT = 5;
export const ROW_COUNT = 3;
export const CELLS_PER_SPIN = REEL_COUNT * ROW_COUNT;

/**
 * Per-reel symbol weights.
 *
 * One shared table keeps the published RTP analytically stable and gives a
 * healthy hit frequency: the four court cards dominate, the premium symbols are
 * progressively rarer, and Zeus (wild) is the scarcest symbol on the reels.
 * The scatter sits at ~2.8% per cell, which puts a scatter bonus roughly every
 * 35 spins — frequent enough for a two-player demo session.
 */
const BASE_WEIGHTS: readonly { value: TempleSymbol; weight: number }[] = [
  { value: SYMBOLS.ZEUS, weight: 12 },
  { value: SYMBOLS.LIGHTNING, weight: 30 },
  { value: SYMBOLS.TEMPLE, weight: 28 },
  { value: SYMBOLS.EAGLE, weight: 45 },
  { value: SYMBOLS.SHIELD, weight: 55 },
  { value: SYMBOLS.LAUREL, weight: 55 },
  { value: SYMBOLS.COIN, weight: 75 },
  { value: SYMBOLS.ACE, weight: 175 },
  { value: SYMBOLS.KING, weight: 175 },
  { value: SYMBOLS.QUEEN, weight: 175 },
  { value: SYMBOLS.JACK, weight: 175 },
];

/** Slight per-reel flavour: premium symbols thin out towards the outside. */
const REEL_MODIFIERS: readonly Record<string, number>[] = [
  { ZEUS: 1, LIGHTNING: 1, TEMPLE: 1, EAGLE: 0.8, SHIELD: 0.9, LAUREL: 1, COIN: 1 },
  { ZEUS: 1, LIGHTNING: 1.1, TEMPLE: 1, EAGLE: 1, SHIELD: 1, LAUREL: 1, COIN: 1 },
  { ZEUS: 1, LIGHTNING: 1.1, TEMPLE: 1, EAGLE: 1.1, SHIELD: 1.1, LAUREL: 1, COIN: 1 },
  { ZEUS: 1, LIGHTNING: 1.1, TEMPLE: 1, EAGLE: 1, SHIELD: 1, LAUREL: 1, COIN: 1 },
  { ZEUS: 1, LIGHTNING: 1, TEMPLE: 1, EAGLE: 0.8, SHIELD: 0.9, LAUREL: 1, COIN: 1 },
];

export const REEL_WEIGHTS: readonly { value: TempleSymbol; weight: number }[][] =
  REEL_MODIFIERS.map((modifier) =>
    BASE_WEIGHTS.map((entry) => ({
      value: entry.value,
      weight: entry.weight * (modifier[entry.value] ?? 1),
    })),
  );

/** Spins one cell per (reel, row). Returns `[reel][row]`. */
export function spinGrid(rng: Rng): TempleSymbol[][] {
  const grid: TempleSymbol[][] = [];
  for (let reel = 0; reel < REEL_COUNT; reel += 1) {
    const weights = REEL_WEIGHTS[reel] ?? BASE_WEIGHTS;
    const column: TempleSymbol[] = [];
    for (let row = 0; row < ROW_COUNT; row += 1) {
      column.push(rng.weighted(weights));
    }
    grid.push(column);
  }
  return grid;
}

export function countSymbol(grid: TempleSymbol[][], symbol: TempleSymbol): number {
  let total = 0;
  for (const column of grid) {
    for (const cell of column) {
      if (cell === symbol) total += 1;
    }
  }
  return total;
}

export function isWild(symbol: TempleSymbol): boolean {
  return symbol === WILD_SYMBOL;
}

export function isScatter(symbol: TempleSymbol): boolean {
  return symbol === SCATTER_SYMBOL;
}
