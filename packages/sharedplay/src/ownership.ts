import { OWNERSHIP_SCALE } from "@sharedplay/types";

/**
 * Ownership and settlement math.
 *
 * Everything here is integer math: contributions are whole demo credits and
 * ownership is basis points. Two invariants are non-negotiable and covered by
 * tests:
 *
 *   1. sum(ownershipBp) === OWNERSHIP_SCALE for a funded session
 *   2. sum(shares) === bankroll  (settlement never loses or invents credits)
 */

export interface ContributionInput {
  userId: string;
  amount: number;
}

export interface OwnershipRow extends ContributionInput {
  ownershipBp: number;
}

export interface SettlementRow {
  userId: string;
  /** Credits returned to the player's wallet. */
  share: number;
  /** share - contribution (may be negative). */
  profit: number;
  contribution: number;
  ownershipBp: number;
}

export function totalContribution(contributions: readonly ContributionInput[]): number {
  return contributions.reduce((sum, entry) => sum + entry.amount, 0);
}

/**
 * Contribution → basis points, using the largest-remainder method so the rows
 * always sum to exactly OWNERSHIP_SCALE. Rows with zero contribution get 0 bp.
 * Remainder points are handed out in descending fractional order, ties broken
 * by input order (deterministic — no randomness in the money path).
 */
export function calculateOwnership(
  contributions: readonly ContributionInput[],
): OwnershipRow[] {
  const total = totalContribution(contributions);
  if (total <= 0) {
    return contributions.map((entry) => ({ ...entry, ownershipBp: 0 }));
  }

  const rows = contributions.map((entry, index) => {
    const exact = (entry.amount * OWNERSHIP_SCALE) / total;
    const floor = Math.floor(exact);
    return { ...entry, ownershipBp: floor, fraction: exact - floor, index };
  });

  let assigned = rows.reduce((sum, row) => sum + row.ownershipBp, 0);
  let remainder = OWNERSHIP_SCALE - assigned;
  if (remainder > 0) {
    const byFraction = [...rows].sort(
      (a, b) => b.fraction - a.fraction || a.index - b.index,
    );
    for (const row of byFraction) {
      if (remainder <= 0) break;
      if (row.amount <= 0) continue;
      row.ownershipBp += 1;
      remainder -= 1;
    }
  }

  return rows.map(({ index: _index, fraction: _fraction, ...row }) => row);
}

/**
 * Splits `bankroll` across contributors by ownership.
 *
 * Uses the same largest-remainder method, but the fractional parts are computed
 * from basis points so `sum(share) === bankroll` exactly. The final row absorbs
 * nothing — every row that owns bp>0 participates in the remainder, which keeps
 * the result independent of iteration order for the common cases.
 */
export function settleShares(
  bankroll: number,
  contributions: readonly ContributionInput[],
): SettlementRow[] {
  const ownership = calculateOwnership(contributions);
  const safeBankroll = Math.max(0, Math.floor(bankroll));

  const rows = ownership.map((row, index) => {
    const exact = (safeBankroll * row.ownershipBp) / OWNERSHIP_SCALE;
    const floor = Math.floor(exact);
    return {
      userId: row.userId,
      contribution: row.amount,
      ownershipBp: row.ownershipBp,
      share: floor,
      fraction: exact - floor,
      index,
    };
  });

  let remainder = safeBankroll - rows.reduce((sum, row) => sum + row.share, 0);
  if (remainder > 0) {
    const byFraction = [...rows].sort(
      (a, b) => b.fraction - a.fraction || a.index - b.index,
    );
    for (const row of byFraction) {
      if (remainder <= 0) break;
      if (row.ownershipBp <= 0) continue;
      row.share += 1;
      remainder -= 1;
    }
  }

  return rows.map((row) => ({
    userId: row.userId,
    contribution: row.contribution,
    ownershipBp: row.ownershipBp,
    share: row.share,
    profit: row.share - row.contribution,
  }));
}

/** Ownership after one additional contribution, without mutating the session. */
export function ownershipAfterContribution(
  contributions: readonly ContributionInput[],
  userId: string,
  additional: number,
): OwnershipRow[] {
  const merged = contributions.map((entry) =>
    entry.userId === userId ? { ...entry, amount: entry.amount + additional } : entry,
  );
  if (!merged.some((entry) => entry.userId === userId)) {
    merged.push({ userId, amount: additional });
  }
  return calculateOwnership(merged);
}
