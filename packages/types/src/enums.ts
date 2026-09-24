/**
 * String-union "enums".
 *
 * Prisma's SQLite connector does not enforce enum values at the database level,
 * so every status/type column is stored as TEXT and validated here in the
 * application layer. These unions are the single source of truth.
 */

export const DEMO_STARTING_BALANCE = 10_000;

/** Ownership is stored in basis points so the money path never touches floats. */
export const OWNERSHIP_SCALE = 10_000;

/** Basis points >= this share of the bankroll count as a "large bet" worth voting on. */
export const LARGE_BET_THRESHOLD_BP = 1_500;

export type SessionStatus = "LOBBY" | "ACTIVE" | "CLOSING" | "CLOSED";

export const SESSION_STATUSES: readonly SessionStatus[] = [
  "LOBBY",
  "ACTIVE",
  "CLOSING",
  "CLOSED",
];

export type LedgerEntryType =
  | "CONTRIBUTION"
  | "BET"
  | "WIN"
  | "BONUS"
  | "ADJUSTMENT"
  | "SETTLEMENT";

export type VoteType =
  | "CASH_OUT"
  | "LARGE_BET"
  | "BONUS_OPTION"
  | "PASS_CONTROL";

export type VoteStatus = "OPEN" | "PASSED" | "FAILED" | "CANCELLED";

export type VoteRule = "MAJORITY" | "UNANIMOUS";

export type InvitationStatus =
  | "PENDING"
  | "OPENED"
  | "ACCEPTED"
  | "DECLINED"
  | "EXPIRED";

export type GameType = "SLOT" | "ROULETTE" | "BLACKJACK";

export type RngMode = "random" | "seeded";

export type FriendshipStatus = "PENDING" | "ACCEPTED" | "BLOCKED";

export type SquadRole = "OWNER" | "MEMBER";

export type BonusPath = "LIGHTNING" | "SHIELD";

export const REACTION_EMOJIS = ["🔥", "😂", "⚡", "😱", "👏"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export function isReactionEmoji(value: string): value is ReactionEmoji {
  return (REACTION_EMOJIS as readonly string[]).includes(value);
}

export const DEFAULT_CONTROL_ROTATION_EVERY = 10;

/** The ZEUS POWER team meter fills to this and unlocks the team bonus. */
export const ZEUS_METER_TARGET = 100;

/**
 * Analytics event vocabulary. Recording starts on day one; the investor
 * dashboard (phase 9) is the consumer.
 */
export type AnalyticsEventName =
  | "user_signup"
  | "user_login"
  | "game_opened"
  | "game_started"
  | "bet_placed"
  | "game_result"
  | "shared_session_created"
  | "invite_sent"
  | "invite_opened"
  | "invite_accepted"
  | "shared_session_started"
  | "controller_changed"
  | "control_requested"
  | "vote_started"
  | "vote_cast"
  | "vote_completed"
  | "reaction_sent"
  | "chat_message_sent"
  | "shared_session_closed"
  | "squad_created"
  | "squad_joined"
  | "friend_invited"
  | "friend_added"
  | "responsible_gaming_triggered";
