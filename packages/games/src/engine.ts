import type { GameType, GameView } from "@sharedplay/types";
import type { Rng } from "./rng";

/**
 * Events emitted by a game engine. SharedPlay and the session service listen to
 * these; they never inspect game internals.
 */
export type GameEventType =
  | "BET_ACCEPTED"
  | "ROUND_STARTED"
  | "ROUND_RESULT"
  | "PAYOUT"
  | "BONUS_TRIGGERED"
  | "GAME_STATE_CHANGED";

export interface GameEvent {
  type: GameEventType;
  payload: Record<string, unknown>;
}

export interface GameConfig {
  [key: string]: unknown;
}

export interface GameContext {
  rng: Rng;
  /** Server-generated id for the round being resolved. */
  roundId: string;
  /**
   * True when resolving as part of a shared session. Engines use this to defer
   * decisions that participants must make together (e.g. bonus paths).
   */
  multiplayer: boolean;
}

export interface BetAcceptance<S> {
  state: S;
  accepted: boolean;
  bet: number;
  reason?: string;
  events: GameEvent[];
}

export interface RoundResolution<S> {
  state: S;
  payout: number;
  bonusTriggered: boolean;
  accepted: boolean;
  reason?: string;
  events: GameEvent[];
  view: GameView;
}

export interface ActionResolution<S> extends RoundResolution<S> {}

/**
 * Every game implements this. SharedPlay is deliberately unaware of the rules
 * behind it, so future games (roulette, blackjack) plug in without touching the
 * SharedPlay domain.
 */
export interface GameEngine<SState, TAction = never> {
  readonly slug: string;
  readonly name: string;
  readonly type: GameType;
  readonly multiplayerEnabled: boolean;
  readonly betLevels: readonly number[];
  readonly defaultBet: number;

  createState(config?: GameConfig): SState;
  /** Rehydrate from a persisted JSON blob, tolerating older shapes. */
  hydrate(raw: unknown): SState;
  serialize(state: SState): unknown;
  getState(state: SState): GameView;

  /** Validates the stake and records it on the state. Does not resolve. */
  placeBet(state: SState, bet: number): BetAcceptance<SState>;
  /** Resolves the pending round. */
  resolveRound(state: SState, ctx: GameContext): RoundResolution<SState>;
  /** Participant-driven decisions (bonus paths, hit/stand, ...). */
  performAction(state: SState, action: TAction, ctx: GameContext): ActionResolution<SState>;
}
