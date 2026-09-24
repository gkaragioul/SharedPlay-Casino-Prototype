import type { VoteRule, VoteStatus, VoteType } from "@sharedplay/types";

/**
 * Generic voting engine.
 *
 * SharedPlay uses one engine for every group decision — cash out, large bet,
 * bonus path, pass control. The rule lives on the vote so new decisions are
 * data, not code.
 *
 * Resolution rules:
 *  - MAJORITY / UNANIMOUS (YES/NO): a vote completes when every eligible player
 *    has answered, or earlier, the moment the outcome can no longer change
 *    ("mathematically decided").
 *  - PLURALITY (multi-option, e.g. BONUS_OPTION): completes when everyone has
 *    answered, or when one option already holds more than half of the eligible
 *    votes; ties are broken deterministically by declared option order.
 */

export interface VoteResponseInput {
  userId: string;
  choice: string;
  createdAt?: Date;
}

export interface TallyOptions {
  type: VoteType;
  rule: VoteRule;
  /** Everyone currently able to vote (participants who have not left). */
  eligibleUserIds: readonly string[];
  responses: readonly VoteResponseInput[];
  /** For PLURALITY votes: option ids in display order. */
  optionOrder?: readonly string[];
}

export interface VoteOutcome {
  status: "OPEN" | "PASSED" | "FAILED" | "CANCELLED";
  /** For PLURALITY votes: the winning option id. */
  winner: string | null;
  yes: number;
  no: number;
  total: number;
  eligible: number;
  byChoice: Record<string, number>;
  leader: string | null;
  /** Eligible players who have not answered yet. */
  pending: string[];
}

export const YES = "YES";
export const NO = "NO";

/** Votes that only make sense as YES/NO. */
export const BINARY_VOTE_TYPES: readonly VoteType[] = ["CASH_OUT", "LARGE_BET", "PASS_CONTROL"];

export function defaultRuleFor(type: VoteType): VoteRule {
  // Cash-out moves everyone's money, so it defaults to unanimity. Everything
  // else is a simple majority; both are overridable per vote.
  return type === "CASH_OUT" ? "UNANIMOUS" : "MAJORITY";
}

export function isBinary(type: VoteType): boolean {
  return BINARY_VOTE_TYPES.includes(type);
}

export function tallyVote(options: TallyOptions): VoteOutcome {
  const eligible = [...options.eligibleUserIds];
  const eligibleSet = new Set(eligible);

  // Only the latest response from an eligible participant counts.
  const latest = new Map<string, VoteResponseInput>();
  for (const response of options.responses) {
    if (!eligibleSet.has(response.userId)) continue;
    latest.set(response.userId, response);
  }

  const byChoice: Record<string, number> = {};
  let yes = 0;
  let no = 0;
  for (const response of latest.values()) {
    byChoice[response.choice] = (byChoice[response.choice] ?? 0) + 1;
    if (response.choice === YES) yes += 1;
    if (response.choice === NO) no += 1;
  }

  const pending = eligible.filter((userId) => !latest.has(userId));
  const answered = eligible.length - pending.length;

  let leader: string | null = null;
  let leaderCount = 0;
  const order = options.optionOrder;
  const choices = Object.keys(byChoice).sort((a, b) => {
    const diff = (byChoice[b] ?? 0) - (byChoice[a] ?? 0);
    if (diff !== 0) return diff;
    if (order) {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
    }
    return a < b ? -1 : 1;
  });
  if (choices.length > 0) {
    leader = choices[0]!;
    leaderCount = byChoice[leader] ?? 0;
  }

  const resolved = resolveOutcome(options, {
    yes,
    no,
    answered,
    pending,
    byChoice,
    leader,
    leaderCount,
    eligible: eligible.length,
  });

  return {
    status: resolved.status,
    winner: resolved.winner,
    yes,
    no,
    total: latest.size,
    eligible: eligible.length,
    byChoice,
    leader,
    pending,
  };
}

interface ResolveInput {
  yes: number;
  no: number;
  answered: number;
  pending: string[];
  byChoice: Record<string, number>;
  leader: string | null;
  leaderCount: number;
  eligible: number;
}

function resolveOutcome(
  options: TallyOptions,
  input: ResolveInput,
): Pick<VoteOutcome, "status" | "winner"> {
  const { eligible, answered, pending } = input;
  if (eligible === 0) return { status: "FAILED", winner: null };

  if (isBinary(options.type)) {
    if (options.rule === "UNANIMOUS") {
      // A single "no" is a veto and can never be overturned.
      if (input.no > 0) return { status: "FAILED", winner: null };
      if (input.yes === eligible) return { status: "PASSED", winner: null };
    } else {
      if (input.yes > eligible / 2) return { status: "PASSED", winner: null };
      if (input.no > eligible / 2) return { status: "FAILED", winner: null };
    }
    if (answered === eligible) {
      if (options.rule === "UNANIMOUS") {
        return input.yes === eligible
          ? { status: "PASSED", winner: null }
          : { status: "FAILED", winner: null };
      }
      return input.yes > input.no
        ? { status: "PASSED", winner: null }
        : { status: "FAILED", winner: null };
    }
    return { status: "OPEN", winner: null };
  }

  // PLURALITY — bonus paths and other multi-option decisions.
  const leader = input.leader;
  const leaderCount = input.leaderCount;
  if (leader !== null && leaderCount > eligible / 2) {
    return { status: "PASSED", winner: leader };
  }
  if (answered === eligible) {
    // Full turnout: leader wins unless the top two are tied, in which case the
    // declared option order breaks the tie (deterministic).
    const sorted = Object.entries(input.byChoice).sort((a, b) => b[1] - a[1]);
    if (sorted.length >= 2 && sorted[0]![1] === sorted[1]![1]) {
      if (options.optionOrder) {
        const [a, b] = sorted;
        const ai = options.optionOrder.indexOf(a![0]);
        const bi = options.optionOrder.indexOf(b![0]);
        const winner = ai !== -1 && (bi === -1 || ai < bi) ? a![0] : b![0];
        return { status: "PASSED", winner };
      }
    }
    return { status: "PASSED", winner: leader };
  }
  return { status: "OPEN", winner: null };
}

/** A CASH_OUT vote that passes means the session should settle. */
export function shouldSettle(type: VoteType, outcome: VoteOutcome): boolean {
  return type === "CASH_OUT" && outcome.status === "PASSED";
}

export function normalizeStatus(status: string): VoteStatus {
  return (["OPEN", "PASSED", "FAILED", "CANCELLED"] as const).includes(status as VoteStatus)
    ? (status as VoteStatus)
    : "OPEN";
}
