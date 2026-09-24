import { describe, expect, it } from "vitest";
import { createRng } from "../src/rng";
import {
  BET_LEVELS,
  TEMPLE_MULTIPLAYER,
  evaluatePaylines,
  templeOfZeus,
  type TempleState,
} from "../src/temple-of-zeus";
import { SYMBOLS, type TempleSymbol } from "../src/temple-of-zeus/symbols";

const BET = 10;
const LINE_BET = BET / 20;
const SCALE = 3.187;

function context(seed: string, multiplayer = false) {
  return { rng: createRng({ mode: "seeded", seed }), roundId: "round-test", multiplayer };
}

/** Builds `[reel][row]` from three row strings of five symbols. */
function gridFromRows(rows: [TempleSymbol[], TempleSymbol[], TempleSymbol[]]): TempleSymbol[][] {
  return Array.from({ length: 5 }, (_, reel) =>
    rows.map((row) => row[reel] as TempleSymbol),
  );
}

describe("evaluatePaylines", () => {
  it("pays only the lines that actually match", () => {
    const grid = gridFromRows([
      [SYMBOLS.ACE, SYMBOLS.ACE, SYMBOLS.ACE, SYMBOLS.ACE, SYMBOLS.ACE],
      [SYMBOLS.KING, SYMBOLS.KING, SYMBOLS.KING, SYMBOLS.KING, SYMBOLS.KING],
      [SYMBOLS.QUEEN, SYMBOLS.QUEEN, SYMBOLS.QUEEN, SYMBOLS.QUEEN, SYMBOLS.QUEEN],
    ]);

    const { lines } = evaluatePaylines(grid, BET);

    // Lines 1, 2 and 3 are the three straight rows; nothing else should match.
    expect(lines).toHaveLength(3);
    expect(lines.map((line) => line.symbol).sort()).toEqual([
      SYMBOLS.ACE,
      SYMBOLS.KING,
      SYMBOLS.QUEEN,
    ]);
    for (const line of lines) expect(line.count).toBe(5);
  });

  it("computes payout from the line bet and the payout scale", () => {
    const grid = gridFromRows([
      [SYMBOLS.ACE, SYMBOLS.ACE, SYMBOLS.ACE, SYMBOLS.ACE, SYMBOLS.ACE],
      [SYMBOLS.KING, SYMBOLS.KING, SYMBOLS.KING, SYMBOLS.KING, SYMBOLS.KING],
      [SYMBOLS.JACK, SYMBOLS.JACK, SYMBOLS.JACK, SYMBOLS.JACK, SYMBOLS.JACK],
    ]);

    const { lines } = evaluatePaylines(grid, BET);
    const ace = lines.find((line) => line.symbol === SYMBOLS.ACE);
    expect(ace?.payout).toBe(Math.floor(100 * LINE_BET * SCALE));
  });

  it("lets Zeus substitute for a regular symbol", () => {
    // Row-major: top line is ZEUS, ACE, ACE, ACE, KING.
    const grid = gridFromRows([
      [SYMBOLS.ZEUS, SYMBOLS.ACE, SYMBOLS.ACE, SYMBOLS.ACE, SYMBOLS.KING],
      [SYMBOLS.KING, SYMBOLS.KING, SYMBOLS.KING, SYMBOLS.KING, SYMBOLS.KING],
      [SYMBOLS.QUEEN, SYMBOLS.QUEEN, SYMBOLS.QUEEN, SYMBOLS.QUEEN, SYMBOLS.QUEEN],
    ]);

    const { lines } = evaluatePaylines(grid, BET);
    const top = lines.find((line) => line.line === 1);
    expect(top?.symbol).toBe(SYMBOLS.ACE);
    expect(top?.count).toBe(4);
    expect(top?.positions).toEqual([0, 3, 6, 9]);
  });

  it("never starts a line win on the scatter", () => {
    const grid = gridFromRows([
      [SYMBOLS.TEMPLE, SYMBOLS.TEMPLE, SYMBOLS.TEMPLE, SYMBOLS.TEMPLE, SYMBOLS.TEMPLE],
      [SYMBOLS.KING, SYMBOLS.KING, SYMBOLS.KING, SYMBOLS.KING, SYMBOLS.KING],
      [SYMBOLS.QUEEN, SYMBOLS.QUEEN, SYMBOLS.QUEEN, SYMBOLS.QUEEN, SYMBOLS.QUEEN],
    ]);

    const { lines } = evaluatePaylines(grid, BET);
    expect(lines.some((line) => line.symbol === SYMBOLS.TEMPLE)).toBe(false);
  });

  it("ignores runs shorter than three", () => {
    const grid = gridFromRows([
      [SYMBOLS.ACE, SYMBOLS.ACE, SYMBOLS.KING, SYMBOLS.QUEEN, SYMBOLS.JACK],
      [SYMBOLS.KING, SYMBOLS.QUEEN, SYMBOLS.JACK, SYMBOLS.ACE, SYMBOLS.KING],
      [SYMBOLS.QUEEN, SYMBOLS.JACK, SYMBOLS.ACE, SYMBOLS.KING, SYMBOLS.QUEEN],
    ]);

    const { lines } = evaluatePaylines(grid, BET);
    expect(lines).toHaveLength(0);
  });
});

describe("templeOfZeus engine", () => {
  it("validates the stake", () => {
    const state = templeOfZeus.createState({ bet: BET });
    expect(templeOfZeus.placeBet(state, 0).accepted).toBe(false);
    expect(templeOfZeus.placeBet(state, -5).accepted).toBe(false);
    expect(templeOfZeus.placeBet(state, 1.5).accepted).toBe(false);
    expect(templeOfZeus.placeBet(state, 999_999).accepted).toBe(false);
    for (const level of BET_LEVELS) {
      expect(templeOfZeus.placeBet(state, level).accepted).toBe(true);
    }
  });

  it("refuses to spin without a bet", () => {
    const state: TempleState = { ...templeOfZeus.createState({ bet: BET }), bet: 0 };
    const result = templeOfZeus.resolveRound(state, context("no-bet"));
    expect(result.accepted).toBe(false);
    expect(result.payout).toBe(0);
  });

  it("is deterministic for a given seed", () => {
    const play = () => {
      let state = templeOfZeus.createState({ bet: BET });
      state = templeOfZeus.placeBet(state, BET).state;
      const result = templeOfZeus.resolveRound(state, context("fixed-seed"));
      return { payout: result.payout, state: result.state };
    };
    const first = play();
    const second = play();
    expect(first.payout).toBe(second.payout);
    expect(JSON.stringify(first.state)).toEqual(JSON.stringify(second.state));
  });

  it("keeps the payout consistent with the lines it reports", () => {
    const rng = createRng({ mode: "seeded", seed: "consistency" });
    let state = templeOfZeus.createState({ bet: BET });
    for (let i = 0; i < 400; i += 1) {
      state = templeOfZeus.placeBet(state, BET).state;
      const result = templeOfZeus.resolveRound(state, {
        rng,
        roundId: `spin-${i}`,
        multiplayer: false,
      });
      state = result.state;
      const lineTotal = result.state.lastLines.reduce((sum, line) => sum + line.payout, 0);
      expect(result.payout).toBeGreaterThanOrEqual(lineTotal);
    }
  });

  it("defers the bonus to the participants in a shared session", () => {
    const rng = createRng({ mode: "seeded", seed: "shared-bonus" });
    let state = templeOfZeus.createState({ bet: BET });
    let triggered: TempleState | null = null;

    for (let i = 0; i < 3_000 && !triggered; i += 1) {
      state = templeOfZeus.placeBet(state, BET).state;
      const result = templeOfZeus.resolveRound(state, {
        rng,
        roundId: `spin-${i}`,
        multiplayer: true,
      });
      state = result.state;
      if (result.bonusTriggered) triggered = result.state;
    }

    expect(triggered).not.toBeNull();
    const pending = triggered?.pendingBonusChoice;
    expect(pending).not.toBeNull();
    expect(pending?.options).toHaveLength(2);

    // Spinning again must be refused until the choice is made.
    const blocked = templeOfZeus.resolveRound(triggered as TempleState, context("ignored", true));
    expect(blocked.accepted).toBe(false);

    const chosen = pending?.options[0];
    expect(chosen).toBeDefined();
    const resolved = templeOfZeus.performAction(
      triggered as TempleState,
      { kind: "choose-bonus-path", path: chosen!.id },
      context("bonus-play", true),
    );
    expect(resolved.accepted).toBe(true);
    expect(resolved.state.pendingBonusChoice).toBeNull();
    expect(resolved.state.lastBonusResult?.spins).toHaveLength(chosen!.spins);
    expect(resolved.payout).toBe(resolved.state.lastBonusResult?.totalWin);
  });

  it("resolves the bonus inline for solo play", () => {
    const rng = createRng({ mode: "seeded", seed: "solo-bonus" });
    let state = templeOfZeus.createState({ bet: BET });
    let sawBonus = false;

    for (let i = 0; i < 3_000 && !sawBonus; i += 1) {
      state = templeOfZeus.placeBet(state, BET).state;
      const result = templeOfZeus.resolveRound(state, {
        rng,
        roundId: `spin-${i}`,
        multiplayer: false,
      });
      state = result.state;
      expect(state.pendingBonusChoice).toBeNull();
      if (result.bonusTriggered) {
        sawBonus = true;
        expect(state.lastBonusResult).not.toBeNull();
      }
    }

    expect(sawBonus).toBe(true);
  });

  it("unlocks and resets the ZEUS POWER team meter", () => {
    const rng = createRng({ mode: "seeded", seed: "team-meter" });
    let state = templeOfZeus.createState({ bet: BET });
    let unlocked = false;

    for (let i = 0; i < 3_000 && !unlocked; i += 1) {
      // Multiplayer defers bonuses; clear any scatter choice so play can continue.
      if (state.pendingBonusChoice) {
        if (state.pendingBonusChoice.trigger === "team") {
          unlocked = true;
          expect(state.teamMeter).toBe(TEMPLE_MULTIPLAYER.meterTarget);
          const option = state.pendingBonusChoice.options[0];
          const resolved = templeOfZeus.performAction(
            state,
            { kind: "choose-bonus-path", path: option!.id },
            context("team-play", true),
          );
          expect(resolved.state.teamMeter).toBe(0);
          expect(resolved.state.teamBonusCount).toBe(1);
          break;
        }
        const scatterOption = state.pendingBonusChoice.options[0];
        state = templeOfZeus.performAction(
          state,
          { kind: "choose-bonus-path", path: scatterOption!.id },
          context("clear-scatter", true),
        ).state;
      }

      state = templeOfZeus.placeBet(state, BET).state;
      const result = templeOfZeus.resolveRound(state, {
        rng,
        roundId: `spin-${i}`,
        multiplayer: true,
      });
      state = result.state;
      expect(state.teamMeter).toBeLessThanOrEqual(TEMPLE_MULTIPLAYER.meterTarget);
    }

    expect(unlocked).toBe(true);
  });

  it("round-trips through serialize/hydrate", () => {
    let state = templeOfZeus.createState({ bet: BET });
    state = templeOfZeus.placeBet(state, 20).state;
    state = templeOfZeus.resolveRound(state, context("round-trip")).state;

    const restored = templeOfZeus.hydrate(templeOfZeus.serialize(state));
    expect(restored).toEqual(state);
    expect(templeOfZeus.hydrate(null).reels).toHaveLength(5);
    expect(templeOfZeus.hydrate({ nonsense: true }).bet).toBe(10);
  });
});
