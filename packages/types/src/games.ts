import type { BonusPath } from "./enums";

/** Client-safe slot geometry: `reels[reelIndex][rowIndex] = symbolId`. */
export interface WinningLineView {
  /** 1-indexed payline number. */
  line: number;
  symbol: string;
  count: number;
  payout: number;
  /** Flat cell positions (reelIndex * rows + rowIndex) highlighted as a win. */
  positions: number[];
}

export interface TempleBonusOptionView {
  id: BonusPath;
  label: string;
  description: string;
  spins: number;
  multiplier: number;
}

export interface TempleBonusView {
  active: boolean;
  path: BonusPath | null;
  spinsRemaining: number;
  multiplier: number;
  totalBonusWin: number;
}

export interface TempleBonusChoiceView {
  /** What set the choice up: a scatter trigger or the ZEUS POWER team meter. */
  trigger: "scatter" | "team";
  options: TempleBonusOptionView[];
}

export interface TempleFreeSpinView {
  reels: string[][];
  win: number;
  winningLines: WinningLineView[];
}

export interface TempleBonusResultView {
  path: BonusPath;
  trigger: "scatter" | "team";
  multiplier: number;
  spins: TempleFreeSpinView[];
  totalWin: number;
}

export interface TempleOfZeusView {
  game: "temple-of-zeus";
  /** `reels[reelIndex][rowIndex]` -> symbol id. */
  reels: string[][];
  lastWin: number;
  lastLines: WinningLineView[];
  lastScatters: number;
  /** 0..ZEUS_METER_TARGET shared progress. */
  teamMeter: number;
  teamMeterTarget: number;
  teamBonusUnlocked: boolean;
  teamBonusCount: number;
  bonus: TempleBonusView;
  /**
   * Set when a scatter (or ZEUS POWER) bonus has triggered but the path has not
   * been decided. In multiplayer this is resolved by a BONUS_OPTION vote.
   */
  pendingBonusChoice: TempleBonusChoiceView | null;
  /** The most recent resolved bonus, kept so late joiners can see it. */
  lastBonusResult: TempleBonusResultView | null;
  /** Id of the round currently on screen, so clients can animate replays once. */
  roundId: string | null;
}

/** Placeholder until European Roulette lands (phase 11). */
export interface RouletteView {
  game: "roulette";
}

export type GameView = TempleOfZeusView | RouletteView | null;

export type TempleAction = {
  kind: "choose-bonus-path";
  path: BonusPath;
};

export interface RoundBroadcast {
  roundId: string;
  sessionId: string;
  userId: string;
  bet: number;
  payout: number;
  /**
   * Pot before the bet was taken and after the round settled. Both travel with
   * the round so a replay animates the pot in the right direction no matter how
   * the round broadcast and the session state interleave on the wire.
   */
  bankrollBefore: number;
  bankrollAfter: number;
  bonusTriggered: boolean;
  reelStops: string[][];
  winningLines: WinningLineView[];
  teamMeter: number;
}

/** A resolved group bonus (free spins) that everyone at the table rewatches. */
export interface BonusBroadcast {
  sessionId: string;
  /** Round whose spin triggered the bonus, for de-duplicating the replay. */
  roundId: string | null;
  userId: string | null;
  /** The bet the triggering round was played for (big-win sizing). */
  bet: number;
  bankrollBefore: number;
  bankrollAfter: number;
  result: TempleBonusResultView;
}
