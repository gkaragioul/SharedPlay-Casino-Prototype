import { describe, expect, it } from "vitest";
import {
  appendLedgerEntry,
  hashLedgerEntry,
  verifyLedgerChain,
  type LedgerEntryDraft,
  type VerifyChainRow,
} from "../src/ledger";

const T0 = new Date("2026-09-23T12:00:00.000Z");

function draft(overrides: Partial<LedgerEntryDraft> = {}): LedgerEntryDraft {
  return {
    seq: 1,
    type: "CONTRIBUTION",
    amount: 500,
    balanceBefore: 0,
    balanceAfter: 500,
    actorId: "george",
    metadata: null,
    createdAt: T0,
    ...overrides,
  };
}

describe("ledger hash chain", () => {
  it("is deterministic for identical inputs", () => {
    const a = hashLedgerEntry(draft(), null);
    const b = hashLedgerEntry(draft(), null);
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it("changes when any field changes", () => {
    const base = hashLedgerEntry(draft(), null);
    expect(hashLedgerEntry(draft({ amount: 501 }), null)).not.toBe(base);
    expect(hashLedgerEntry(draft({ seq: 2 }), null)).not.toBe(base);
    expect(hashLedgerEntry(draft({ createdAt: new Date(T0.getTime() + 1) }), null)).not.toBe(base);
    expect(hashLedgerEntry(draft(), "x".repeat(64))).not.toBe(base);
  });

  it("ignores metadata key order", () => {
    const a = hashLedgerEntry(draft({ metadata: { b: 2, a: 1 } }), null);
    const b = hashLedgerEntry(draft({ metadata: { a: 1, b: 2 } }), null);
    expect(a).toBe(b);
  });

  it("links entries through prevHash", () => {
    const first = appendLedgerEntry(draft({ seq: 1 }), null);
    const second = appendLedgerEntry(
      draft({
        seq: 2,
        type: "BET",
        amount: 20,
        balanceBefore: 500,
        balanceAfter: 480,
        actorId: "george",
        metadata: { game: "temple-of-zeus" },
      }),
      first.entryHash,
    );
    expect(second.prevHash).toBe(first.entryHash);
    expect(second.entryHash).not.toBe(first.entryHash);
  });
});

describe("verifyLedgerChain", () => {
  function buildChain(): VerifyChainRow[] {
    const rows: VerifyChainRow[] = [];
    let prevHash: string | null = null;
    let balance = 0;
    const entries: LedgerEntryDraft[] = [
      draft({ seq: 1, type: "CONTRIBUTION", amount: 500, balanceBefore: 0, balanceAfter: 500, actorId: "george" }),
      draft({ seq: 2, type: "CONTRIBUTION", amount: 500, balanceBefore: 500, balanceAfter: 1000, actorId: "nick" }),
      draft({ seq: 3, type: "BET", amount: 20, balanceBefore: 1000, balanceAfter: 980, actorId: "george" }),
      draft({ seq: 4, type: "WIN", amount: 100, balanceBefore: 980, balanceAfter: 1080, actorId: "george" }),
      draft({ seq: 5, type: "SETTLEMENT", amount: 1080, balanceBefore: 1080, balanceAfter: 0, actorId: null }),
    ];
    for (const entry of entries) {
      const linked = appendLedgerEntry(entry, prevHash);
      prevHash = linked.entryHash;
      balance = entry.balanceAfter;
      void balance;
      rows.push({ ...linked });
    }
    return rows;
  }

  it("accepts an intact chain", () => {
    expect(verifyLedgerChain(buildChain())).toBe(-1);
  });

  it("detects a tampered amount", () => {
    const rows = buildChain();
    rows[2]!.amount = 999;
    expect(verifyLedgerChain(rows)).toBe(2);
  });

  it("detects a re-linked prevHash", () => {
    const rows = buildChain();
    rows[3]!.prevHash = "f".repeat(64);
    expect(verifyLedgerChain(rows)).toBe(3);
  });

  it("detects broken balance continuity", () => {
    const rows = buildChain();
    // Same hash inputs would be recomputed, but continuity fails first when a
    // middle row's balanceBefore no longer matches the previous balanceAfter.
    rows[3]!.balanceBefore = 500;
    rows[3]!.entryHash = hashLedgerEntry(
      {
        seq: rows[3]!.seq,
        type: rows[3]!.type as LedgerEntryDraft["type"],
        amount: rows[3]!.amount,
        balanceBefore: rows[3]!.balanceBefore,
        balanceAfter: rows[3]!.balanceAfter,
        actorId: rows[3]!.actorId,
        metadata: rows[3]!.metadata,
        createdAt: rows[3]!.createdAt,
      },
      rows[3]!.prevHash,
    );
    expect(verifyLedgerChain(rows)).toBe(3);
  });

  it("detects a missing row (sequence gap)", () => {
    const rows = buildChain();
    rows.splice(2, 1);
    expect(verifyLedgerChain(rows)).toBe(2);
  });
});
