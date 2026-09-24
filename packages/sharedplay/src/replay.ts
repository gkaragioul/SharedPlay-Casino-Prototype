/**
 * Replay rules for the shared table.
 *
 * A finished round is broadcast before the new session state, and every screen
 * replays the same spin. These helpers hold the two things a replay has to agree
 * on: the pot numbers it shows, and the stake a group bonus is sized from.
 */

export interface RoundPotFrames {
  /** The pot as it stood before the bet was taken. */
  start: number;
  /** The pot as it stands once the payout landed. */
  end: number;
}

/**
 * The pot numbers a replay of someone else's round shows.
 *
 * Both numbers travel with the round itself, so the replay is right even when the
 * new session state arrives first — the pot never has to be derived from a later
 * bankroll and never jumps backwards on screen.
 */
export function roundPotFrames(bankrollBefore: number, bankrollAfter: number): RoundPotFrames {
  const before = Number.isFinite(bankrollBefore) ? bankrollBefore : bankrollAfter;
  const after = Number.isFinite(bankrollAfter) ? bankrollAfter : bankrollBefore;
  return {
    start: Math.max(0, Math.round(Number.isFinite(before) ? before : 0)),
    end: Math.max(0, Math.round(Number.isFinite(after) ? after : 0)),
  };
}

/**
 * The stake a group free-spins replay is sized from: the bet of the round that
 * triggered the bonus, falling back to the table's default stake when the trigger
 * is unknown. Never zero, so the big-win banner can divide by it.
 */
export function bonusStake(triggeringBet: number | null | undefined, fallback: number): number {
  if (typeof triggeringBet === "number" && Number.isFinite(triggeringBet) && triggeringBet > 0) {
    return Math.round(triggeringBet);
  }
  return Number.isFinite(fallback) && fallback > 0 ? Math.round(fallback) : 1;
}
