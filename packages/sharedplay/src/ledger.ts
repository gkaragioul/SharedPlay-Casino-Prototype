import { createHash } from "node:crypto";
import type { LedgerEntryType } from "@sharedplay/types";

/**
 * Hash-chained session ledger.
 *
 * Every financial movement in a shared session appends an entry whose hash
 * covers the previous entry hash. The result is an append-only, tamper-evident
 * trail — the shape a future KYC/tax/AML audit log would need. The web app
 * persists rows through Prisma; this module owns only the pure derivation so it
 * can be tested (and later reused) without a database.
 */

export interface LedgerEntryDraft {
  seq: number;
  type: LedgerEntryType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  actorId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface LedgerEntryWithHash extends LedgerEntryDraft {
  prevHash: string | null;
  entryHash: string;
}

export const GENESIS_HASH = "0".repeat(64);

function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(String(value));
}

/** Deterministic hash over the entry payload plus the previous chain hash. */
export function hashLedgerEntry(
  draft: LedgerEntryDraft,
  prevHash: string | null,
): string {
  const payload = canonicalize({
    prevHash: prevHash ?? null,
    seq: draft.seq,
    type: draft.type,
    amount: draft.amount,
    balanceBefore: draft.balanceBefore,
    balanceAfter: draft.balanceAfter,
    actorId: draft.actorId,
    metadata: draft.metadata,
    createdAt: draft.createdAt,
  });
  return createHash("sha256").update(payload).digest("hex");
}

export function appendLedgerEntry(
  draft: LedgerEntryDraft,
  prevHash: string | null,
): LedgerEntryWithHash {
  return { ...draft, prevHash, entryHash: hashLedgerEntry(draft, prevHash) };
}

export interface VerifyChainRow {
  seq: number;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  actorId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  prevHash: string | null;
  entryHash: string;
}

/**
 * Recomputes the chain. Returns the index of the first broken link, or -1 when
 * the ledger is intact. Balance continuity is checked alongside hashing so a
 * dropped BET/WIN row is caught even if hashes were recomputed.
 */
export function verifyLedgerChain(rows: readonly VerifyChainRow[]): number {
  let prevHash: string | null = null;
  let expectedBalance: number | null = null;
  let expectedSeq = 1;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    const draft: LedgerEntryDraft = {
      seq: row.seq,
      type: row.type as LedgerEntryType,
      amount: row.amount,
      balanceBefore: row.balanceBefore,
      balanceAfter: row.balanceAfter,
      actorId: row.actorId,
      metadata: row.metadata,
      createdAt: row.createdAt,
    };

    if (row.seq !== expectedSeq) return index;
    if (row.prevHash !== prevHash) return index;
    if (hashLedgerEntry(draft, prevHash) !== row.entryHash) return index;
    if (expectedBalance !== null && row.balanceBefore !== expectedBalance) return index;
    if (row.balanceAfter !== row.balanceBefore + ledgerDelta(row)) return index;

    prevHash = row.entryHash;
    expectedBalance = row.balanceAfter;
    expectedSeq += 1;
  }
  return -1;
}

/** Sign convention: BET/SETTLEMENT reduce the bankroll; the rest are signed deltas. */
function ledgerDelta(row: VerifyChainRow): number {
  switch (row.type) {
    case "BET":
      return -Math.abs(row.amount);
    case "SETTLEMENT":
      // Settlement drains the session wallet; amount is the total paid out.
      return -Math.abs(row.amount);
    case "CONTRIBUTION":
    case "WIN":
    case "BONUS":
    case "ADJUSTMENT":
      return row.amount;
    default:
      return row.amount;
  }
}
