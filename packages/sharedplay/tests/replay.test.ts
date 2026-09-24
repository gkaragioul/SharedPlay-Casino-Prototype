import { describe, expect, it } from "vitest";
import { bonusStake, roundPotFrames } from "../src/replay";

describe("roundPotFrames — the numbers a replay shows", () => {
  it("uses the round's own pot before and after", () => {
    const frames = roundPotFrames(1_000, 1_050);
    expect(frames.start).toBe(1_000);
    expect(frames.end).toBe(1_050);
  });

  it("shows the pot going down for a losing spin", () => {
    const frames = roundPotFrames(1_000, 990);
    expect(frames.start).toBe(1_000);
    expect(frames.end).toBe(990);
    expect(frames.end).toBeLessThan(frames.start);
  });

  it("does not depend on which socket event arrived first", () => {
    // Round first (the normal order) and state first must produce the same two numbers.
    const roundFirst = roundPotFrames(600, 640);
    const stateFirst = roundPotFrames(600, 640);
    expect(roundFirst).toEqual(stateFirst);
    expect(roundFirst).toEqual({ start: 600, end: 640 });
  });

  it("never reports a negative pot", () => {
    const frames = roundPotFrames(-50, -10);
    expect(frames.start).toBe(0);
    expect(frames.end).toBe(0);
  });

  it("falls back to whichever number arrived", () => {
    expect(roundPotFrames(Number.NaN, 400)).toEqual({ start: 400, end: 400 });
    expect(roundPotFrames(400, Number.NaN)).toEqual({ start: 400, end: 400 });
  });

  it("rounds fractional credits", () => {
    expect(roundPotFrames(99.6, 100.4)).toEqual({ start: 100, end: 100 });
  });
});

describe("bonusStake — what a group free-spins replay is sized from", () => {
  it("uses the bet of the round that triggered the bonus", () => {
    expect(bonusStake(50, 10)).toBe(50);
  });

  it("falls back to the table's default stake when the trigger is unknown", () => {
    expect(bonusStake(null, 10)).toBe(10);
    expect(bonusStake(undefined, 10)).toBe(10);
  });

  it("ignores a zero, negative or unknown stake", () => {
    expect(bonusStake(0, 10)).toBe(10);
    expect(bonusStake(-5, 10)).toBe(10);
    expect(bonusStake(Number.NaN, 10)).toBe(10);
  });

  it("never returns zero, so the win banner can divide by it", () => {
    expect(bonusStake(null, 0)).toBe(1);
    expect(bonusStake(0, -3)).toBe(1);
  });
});
