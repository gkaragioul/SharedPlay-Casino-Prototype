import { randomBytes } from "node:crypto";
import type { RngMode } from "@sharedplay/types";

/**
 * The single source of randomness for every game.
 *
 * Rules for this prototype:
 *  - outcomes are produced here and nowhere else;
 *  - outcomes never depend on player behaviour, bet size or identity;
 *  - `seeded` mode exists so tests and scripted demos are reproducible.
 */
export interface Rng {
  readonly mode: RngMode;
  readonly seed: string | null;
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Uniform integer in [min, max] inclusive. */
  range(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  /** Weighted pick. Weights must be non-negative and not all zero. */
  weighted<T>(entries: readonly { value: T; weight: number }[]): T;
  /** Fisher-Yates, returns a new array. */
  shuffle<T>(items: readonly T[]): T[];
}

export interface RngOptions {
  mode?: RngMode;
  seed?: string | number | null;
}

function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small, fast, good-enough PRNG for a demo slot. Not cryptographic. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function resolveRngMode(explicit?: RngMode): RngMode {
  if (explicit) return explicit;
  return process.env.RNG_MODE === "seeded" ? "seeded" : "random";
}

export function createRng(options: RngOptions = {}): Rng {
  const mode = resolveRngMode(options.mode);
  let seedLabel: string | null = null;
  let seedValue: number;

  if (mode === "seeded") {
    const raw = options.seed ?? process.env.RNG_SEED ?? "sharedplay";
    seedLabel = String(raw);
    seedValue = typeof raw === "number" ? raw >>> 0 : hashSeed(seedLabel);
  } else {
    seedValue = randomBytes(4).readUInt32BE(0);
  }

  const generate = mulberry32(seedValue);

  const next = (): number => generate();

  const int = (maxExclusive: number): number => {
    if (maxExclusive <= 1) return 0;
    return Math.floor(generate() * maxExclusive);
  };

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) throw new Error("rng.pick called with an empty array");
    return items[int(items.length)] as T;
  };

  const weighted = <T>(entries: readonly { value: T; weight: number }[]): T => {
    if (entries.length === 0) throw new Error("rng.weighted called with an empty array");
    const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
    if (total <= 0) return pick(entries).value;
    let roll = generate() * total;
    for (const entry of entries) {
      roll -= Math.max(0, entry.weight);
      if (roll < 0) return entry.value;
    }
    return entries[entries.length - 1]!.value;
  };

  const shuffle = <T>(items: readonly T[]): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = int(i + 1);
      const a = copy[i] as T;
      copy[i] = copy[j] as T;
      copy[j] = a;
    }
    return copy;
  };

  return {
    mode,
    seed: seedLabel,
    next,
    int,
    range: (min, max) => (max <= min ? min : min + int(max - min + 1)),
    pick,
    weighted,
    shuffle,
  };
}
