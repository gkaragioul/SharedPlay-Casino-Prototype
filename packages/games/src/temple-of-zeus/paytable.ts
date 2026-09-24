import { SCATTER_SYMBOL, SYMBOLS, type TempleSymbol } from "./symbols";

export const LINES = 20;
export const MIN_MATCH = 3;
export const MAX_MATCH = 5;

/**
 * The 20 fixed paylines, written as the row index (0..2) used on each of the
 * five reels.
 */
export const PAYLINES: readonly (readonly number[])[] = [
  [0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1],
  [2, 2, 2, 2, 2],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2],
  [1, 0, 1, 0, 1],
  [1, 2, 1, 2, 1],
  [0, 0, 1, 0, 0],
  [2, 2, 1, 2, 2],
  [1, 1, 0, 1, 1],
  [1, 1, 2, 1, 1],
  [0, 1, 1, 1, 2],
  [2, 1, 1, 1, 0],
  [0, 2, 2, 2, 0],
];

/**
 * Line wins, expressed as multiples of the LINE bet (total bet / 20).
 *
 * The shape is deliberate: three-of-a-kind is common and returns a fraction of
 * the stake, while four and five of a kind pay increasingly large multiples.
 * That keeps small wins frequent without turning every hit into a near-refund,
 * and leaves the big numbers for the premium symbols.
 */
export const LINE_PAYS: Record<TempleSymbol, Partial<Record<number, number>>> = {
  [SYMBOLS.ZEUS]: { 3: 20, 4: 200, 5: 2000 },
  [SYMBOLS.LIGHTNING]: { 3: 12, 4: 120, 5: 1000 },
  [SYMBOLS.EAGLE]: { 3: 10, 4: 80, 5: 600 },
  [SYMBOLS.SHIELD]: { 3: 8, 4: 60, 5: 400 },
  [SYMBOLS.LAUREL]: { 3: 6, 4: 40, 5: 250 },
  [SYMBOLS.COIN]: { 3: 5, 4: 30, 5: 150 },
  [SYMBOLS.ACE]: { 3: 4, 4: 20, 5: 100 },
  [SYMBOLS.KING]: { 3: 3, 4: 15, 5: 75 },
  [SYMBOLS.QUEEN]: { 3: 2, 4: 10, 5: 50 },
  [SYMBOLS.JACK]: { 3: 2, 4: 8, 5: 40 },
  [SYMBOLS.TEMPLE]: {},
};

/**
 * Scatter pays anywhere on the reels, in multiples of the line bet — so three
 * temples returns a full stake, and five returns twenty-five stakes.
 */
export const SCATTER_PAYS: Partial<Record<number, number>> = {
  3: 20,
  4: 100,
  5: 500,
};

/**
 * Global payout multiplier.
 *
 * The reel weights and paytable above are chosen for feel (hit frequency,
 * volatility shape); this single constant then calibrates the return to player.
 * It is tuned empirically with `pnpm sim:rtp`, which is why the published RTP is
 * a measurable property of the game rather than a guess.
 */
export const PAYOUT_SCALE = 3.187;

export const SCATTER_TRIGGER_COUNT = 3;

/** Multiples of the line bet, converted to credits by the engine. */
export function lineMultiplier(symbol: TempleSymbol, count: number): number {
  if (count < MIN_MATCH) return 0;
  return LINE_PAYS[symbol][Math.min(count, MAX_MATCH)] ?? 0;
}

export function scatterMultiplier(count: number): number {
  if (count < SCATTER_TRIGGER_COUNT) return 0;
  return SCATTER_PAYS[Math.min(count, MAX_MATCH)] ?? 0;
}

export { SCATTER_SYMBOL };
