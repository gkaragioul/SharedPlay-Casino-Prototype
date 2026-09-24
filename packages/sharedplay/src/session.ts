import { LARGE_BET_THRESHOLD_BP, type SessionStatus } from "@sharedplay/types";

/**
 * Session-level rules: codes, contributions, bet validation and the status
 * state machine. Pure functions — persistence and broadcasting stay in the web
 * app's session service.
 */

/** Unambiguous alphabet: no O/0, I/1/L. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const TOKEN_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomCode(
  length = 6,
  alphabet: string = CODE_ALPHABET,
  random: (maxExclusive: number) => number = defaultRandom,
): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[random(alphabet.length)] ?? "X";
  }
  return out;
}

export function generateSessionCode(random?: (max: number) => number): string {
  return randomCode(6, CODE_ALPHABET, random);
}

export function generateInviteToken(random?: (max: number) => number): string {
  return randomCode(24, TOKEN_ALPHABET, random);
}

function defaultRandom(maxExclusive: number): number {
  if (maxExclusive <= 1) return 0;
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    const buffer = new Uint32Array(1);
    cryptoObj.getRandomValues(buffer);
    return (buffer[0]! % maxExclusive) >>> 0;
  }
  return Math.floor(Math.random() * maxExclusive);
}

export const MIN_CONTRIBUTION = 10;
export const MAX_CONTRIBUTION = 100_000;
export const MAX_PARTICIPANTS = 8;

export type ContributionRejection =
  | "INVALID_AMOUNT"
  | "BELOW_MINIMUM"
  | "ABOVE_MAXIMUM"
  | "INSUFFICIENT_BALANCE"
  | "SESSION_NOT_JOINABLE"
  | "ALREADY_JOINED"
  | "SESSION_FULL";

export interface ContributionCheck {
  ok: boolean;
  reason?: ContributionRejection;
}

export function validateContribution(input: {
  amount: number;
  userBalance: number;
  sessionStatus: SessionStatus;
  alreadyJoined: boolean;
  participantCount: number;
  maxParticipants: number;
}): ContributionCheck {
  if (input.sessionStatus !== "LOBBY") return { ok: false, reason: "SESSION_NOT_JOINABLE" };
  if (input.alreadyJoined) return { ok: false, reason: "ALREADY_JOINED" };
  if (input.participantCount >= input.maxParticipants) {
    return { ok: false, reason: "SESSION_FULL" };
  }
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    return { ok: false, reason: "INVALID_AMOUNT" };
  }
  if (input.amount < MIN_CONTRIBUTION) return { ok: false, reason: "BELOW_MINIMUM" };
  if (input.amount > MAX_CONTRIBUTION) return { ok: false, reason: "ABOVE_MAXIMUM" };
  if (input.amount > input.userBalance) return { ok: false, reason: "INSUFFICIENT_BALANCE" };
  return { ok: true };
}

export interface BetCheck {
  ok: boolean;
  reason?:
    | "INVALID_BET"
    | "BELOW_MIN"
    | "ABOVE_MAX"
    | "INSUFFICIENT_BANKROLL"
    | "LARGE_BET_VOTE_REQUIRED";
}

export function validateBet(input: {
  bet: number;
  bankroll: number;
  betLevels: readonly number[];
  maxBet?: number;
  /** When a LARGE_BET vote is required but not passed, the bet is refused. */
  largeBetVotePassed?: boolean;
}): BetCheck {
  const maxBet = input.maxBet ?? 100_000;
  if (!Number.isInteger(input.bet) || input.bet <= 0) {
    return { ok: false, reason: "INVALID_BET" };
  }
  if (!input.betLevels.includes(input.bet) && input.bet > (input.betLevels.at(-1) ?? 0)) {
    if (input.bet > maxBet) return { ok: false, reason: "ABOVE_MAX" };
  }
  if (input.bet > maxBet) return { ok: false, reason: "ABOVE_MAX" };
  if (input.bet > input.bankroll) return { ok: false, reason: "INSUFFICIENT_BANKROLL" };
  if (isLargeBet(input.bet, input.bankroll) && !input.largeBetVotePassed) {
    return { ok: false, reason: "LARGE_BET_VOTE_REQUIRED" };
  }
  return { ok: true };
}

/** A bet at/above the threshold of the shared bankroll needs a group vote. */
export function isLargeBet(bet: number, bankroll: number): boolean {
  if (bankroll <= 0) return false;
  return bet * 10_000 >= bankroll * LARGE_BET_THRESHOLD_BP;
}

export const SESSION_TRANSITIONS: Record<SessionStatus, readonly SessionStatus[]> = {
  LOBBY: ["ACTIVE", "CLOSED"],
  ACTIVE: ["CLOSING", "CLOSED"],
  CLOSING: ["CLOSED"],
  CLOSED: [],
};

export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  return SESSION_TRANSITIONS[from].includes(to);
}

export type SessionPhaseCheck = { ok: true } | { ok: false; reason: "INVALID_PHASE" };

/** Betting is only allowed while the session is live. */
export function assertBettingAllowed(status: SessionStatus): SessionPhaseCheck {
  return status === "ACTIVE" ? { ok: true } : { ok: false, reason: "INVALID_PHASE" };
}

/** Contributions only happen while the lobby is still open. */
export function assertContributionAllowed(status: SessionStatus): SessionPhaseCheck {
  return status === "LOBBY" ? { ok: true } : { ok: false, reason: "INVALID_PHASE" };
}

export function formatOwnershipPercent(ownershipBp: number): string {
  const percent = ownershipBp / 100;
  return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(2)}%`;
}
