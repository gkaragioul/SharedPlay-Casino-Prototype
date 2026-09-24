import { describe, expect, it } from "vitest";
import { createRng } from "../src/rng";

describe("rng", () => {
  it("is deterministic in seeded mode", () => {
    const a = createRng({ mode: "seeded", seed: "session-42" });
    const b = createRng({ mode: "seeded", seed: "session-42" });
    const first = Array.from({ length: 50 }, () => a.next());
    const second = Array.from({ length: 50 }, () => b.next());
    expect(first).toEqual(second);
  });

  it("produces different streams for different seeds", () => {
    const a = createRng({ mode: "seeded", seed: "one" });
    const b = createRng({ mode: "seeded", seed: "two" });
    const first = Array.from({ length: 20 }, () => a.next());
    const second = Array.from({ length: 20 }, () => b.next());
    expect(first).not.toEqual(second);
  });

  it("keeps next() inside [0, 1)", () => {
    const rng = createRng({ mode: "seeded", seed: "bounds" });
    for (let i = 0; i < 5_000; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("keeps int() inside [0, maxExclusive)", () => {
    const rng = createRng({ mode: "seeded", seed: "ints" });
    for (let i = 0; i < 5_000; i += 1) {
      const value = rng.int(6);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(6);
    }
  });

  it("respects weights", () => {
    const rng = createRng({ mode: "seeded", seed: "weights" });
    const counts = { heavy: 0, light: 0 };
    for (let i = 0; i < 20_000; i += 1) {
      counts[rng.weighted([
        { value: "heavy" as const, weight: 9 },
        { value: "light" as const, weight: 1 },
      ])] += 1;
    }
    expect(counts.heavy).toBeGreaterThan(counts.light * 5);
  });

  it("shuffles without losing elements", () => {
    const rng = createRng({ mode: "seeded", seed: "shuffle" });
    const input = Array.from({ length: 30 }, (_, i) => i);
    const output = rng.shuffle(input);
    expect(output).toHaveLength(input.length);
    expect([...output].sort((a, b) => a - b)).toEqual(input);
  });
});
