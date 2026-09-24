import { describe, expect, it } from "vitest";
import { OWNERSHIP_SCALE } from "@sharedplay/types";
import {
  calculateOwnership,
  ownershipAfterContribution,
  settleShares,
  totalContribution,
} from "../src/ownership";

describe("calculateOwnership", () => {
  it("splits an even contribution evenly", () => {
    const rows = calculateOwnership([
      { userId: "george", amount: 500 },
      { userId: "nick", amount: 500 },
    ]);
    expect(rows.map((row) => row.ownershipBp)).toEqual([5000, 5000]);
    expect(rows.reduce((sum, row) => sum + row.ownershipBp, 0)).toBe(OWNERSHIP_SCALE);
  });

  it("handles uneven contributions", () => {
    const rows = calculateOwnership([
      { userId: "george", amount: 700 },
      { userId: "nick", amount: 300 },
    ]);
    expect(rows[0]!.ownershipBp).toBe(7000);
    expect(rows[1]!.ownershipBp).toBe(3000);
  });

  it("always sums to exactly 10000 bp (remainder distribution)", () => {
    const cases = [
      [{ userId: "a", amount: 1 }, { userId: "b", amount: 1 }, { userId: "c", amount: 1 }],
      [{ userId: "a", amount: 333 }, { userId: "b", amount: 333 }, { userId: "c", amount: 334 }],
      [{ userId: "a", amount: 7 }, { userId: "b", amount: 993 }],
      [{ userId: "a", amount: 1 }, { userId: "b", amount: 999 }],
      [{ userId: "a", amount: 12_345 }, { userId: "b", amount: 6_789 }, { userId: "c", amount: 4 }],
    ];
    for (const contributions of cases) {
      const rows = calculateOwnership(contributions);
      expect(rows.reduce((sum, row) => sum + row.ownershipBp, 0)).toBe(OWNERSHIP_SCALE);
      for (const row of rows) expect(row.ownershipBp).toBeGreaterThanOrEqual(0);
    }
  });

  it("gives zero to zero contributors", () => {
    const rows = calculateOwnership([
      { userId: "a", amount: 500 },
      { userId: "b", amount: 0 },
    ]);
    expect(rows.find((row) => row.userId === "b")!.ownershipBp).toBe(0);
    expect(rows.find((row) => row.userId === "a")!.ownershipBp).toBe(OWNERSHIP_SCALE);
  });

  it("returns all zeros for an empty pool", () => {
    const rows = calculateOwnership([
      { userId: "a", amount: 0 },
      { userId: "b", amount: 0 },
    ]);
    expect(rows.every((row) => row.ownershipBp === 0)).toBe(true);
  });

  it("sums contributions", () => {
    expect(totalContribution([{ userId: "a", amount: 3 }, { userId: "b", amount: 4 }])).toBe(7);
  });
});

describe("settleShares", () => {
  it("splits the bankroll by ownership", () => {
    const shares = settleShares(2000, [
      { userId: "george", amount: 700 },
      { userId: "nick", amount: 300 },
    ]);
    expect(shares[0]!.share).toBe(1400);
    expect(shares[1]!.share).toBe(600);
    expect(shares[0]!.profit).toBe(700);
    expect(shares[1]!.profit).toBe(300);
  });

  it("never loses or invents credits (sum === bankroll)", () => {
    const bankrolls = [1000, 1423, 1600, 999, 1, 0, 12_345, 77_777];
    const sets = [
      [{ userId: "a", amount: 500 }, { userId: "b", amount: 500 }],
      [{ userId: "a", amount: 1 }, { userId: "b", amount: 999 }],
      [{ userId: "a", amount: 600 }, { userId: "b", amount: 400 }],
      [
        { userId: "a", amount: 111 },
        { userId: "b", amount: 222 },
        { userId: "c", amount: 333 },
        { userId: "d", amount: 334 },
      ],
    ];
    for (const bankroll of bankrolls) {
      for (const contributions of sets) {
        const shares = settleShares(bankroll, contributions);
        expect(shares.reduce((sum, row) => sum + row.share, 0)).toBe(bankroll);
      }
    }
  });

  it("is fair when the session loses money", () => {
    const shares = settleShares(400, [
      { userId: "george", amount: 500 },
      { userId: "nick", amount: 500 },
    ]);
    expect(shares[0]!.share).toBe(200);
    expect(shares[0]!.profit).toBe(-300);
    expect(shares[1]!.profit).toBe(-300);
  });

  it("clamps a negative/invalid bankroll to zero", () => {
    const shares = settleShares(-100, [{ userId: "a", amount: 100 }]);
    expect(shares[0]!.share).toBe(0);
  });
});

describe("ownershipAfterContribution", () => {
  it("recalculates as a new player joins", () => {
    const after = ownershipAfterContribution(
      [{ userId: "george", amount: 500 }],
      "nick",
      500,
    );
    expect(after.find((row) => row.userId === "nick")!.ownershipBp).toBe(5000);
    expect(after.find((row) => row.userId === "george")!.ownershipBp).toBe(5000);
  });

  it("keeps an existing member's share weighted by total", () => {
    const after = ownershipAfterContribution(
      [
        { userId: "george", amount: 600 },
        { userId: "nick", amount: 400 },
      ],
      "nick",
      600,
    );
    // Nick 1000 of 1600 = 62.5%, George 600 of 1600 = 37.5%.
    expect(after.find((row) => row.userId === "nick")!.ownershipBp).toBe(6250);
    expect(after.find((row) => row.userId === "george")!.ownershipBp).toBe(3750);
    expect(after.reduce((sum, row) => sum + row.ownershipBp, 0)).toBe(OWNERSHIP_SCALE);
  });
});
