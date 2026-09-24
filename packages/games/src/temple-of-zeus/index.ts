import {
  ZEUS_METER_TARGET,
  type BonusPath,
  type GameView,
  type TempleBonusChoiceView,
  type TempleBonusResultView,
  type TempleFreeSpinView,
  type TempleOfZeusView,
  type TempleAction,
  type WinningLineView,
} from "@sharedplay/types";
import type {
  ActionResolution,
  BetAcceptance,
  GameConfig,
  GameContext,
  GameEngine,
  GameEvent,
  RoundResolution,
} from "../engine";
import {
  CELLS_PER_SPIN,
  REEL_COUNT,
  ROW_COUNT,
  countSymbol,
  isScatter,
  isWild,
  spinGrid,
} from "./reels";
import {
  LINES,
  MIN_MATCH,
  PAYLINES,
  PAYOUT_SCALE,
  SCATTER_TRIGGER_COUNT,
  lineMultiplier,
  scatterMultiplier,
} from "./paytable";
import { SCATTER_SYMBOL, SYMBOLS, WILD_SYMBOL, type TempleSymbol } from "./symbols";

export const TEMPLE_SLUG = "temple-of-zeus";

export interface TempleMultiplayerConfig {
  /** Bonus options offered, and how each resolves. */
  bonusPaths: Record<
    BonusPath,
    { label: string; description: string; spins: number; multiplier: number }
  >;
  /** ZEUS POWER bolts added per lightning symbol on the reels. */
  meterPerLightning: number;
  meterTarget: number;
  /**
   * Applied on top of whichever path the team picks when ZEUS POWER fills.
   * The options stay the same, so what the participants vote on is always
   * exactly what they get — the team bonus simply amplifies it.
   */
  teamBonusBoost: { extraSpins: number; multiplierBonus: number };
}

export const TEMPLE_MULTIPLAYER: TempleMultiplayerConfig = {
  bonusPaths: {
    LIGHTNING: {
      label: "Lightning Path",
      description: "Fewer spins at a bigger multiplier. Higher volatility.",
      spins: 6,
      multiplier: 3,
    },
    SHIELD: {
      label: "Shield Path",
      description: "More spins at a steadier multiplier. Safer.",
      spins: 8,
      multiplier: 2,
    },
  },
  meterPerLightning: 4,
  meterTarget: ZEUS_METER_TARGET,
  teamBonusBoost: { extraSpins: 0, multiplierBonus: 2 },
};

export const BET_LEVELS = [1, 2, 5, 10, 20, 50] as const;
export const DEFAULT_BET = 10;
export const MAX_BET = 5_000;

export interface TempleBonusState {
  active: boolean;
  path: BonusPath | null;
  spinsRemaining: number;
  multiplier: number;
  totalBonusWin: number;
}

export interface TempleState {
  version: 1;
  /** Stake for the pending round; 0 means no bet placed. */
  bet: number;
  reels: TempleSymbol[][];
  lastWin: number;
  lastLines: WinningLineView[];
  lastScatters: number;
  teamMeter: number;
  teamBonusCount: number;
  roundId: string | null;
  pendingBonusChoice: TempleBonusChoiceView | null;
  bonus: TempleBonusState;
  lastBonusResult: TempleBonusResultView | null;
}

function emptyGrid(): TempleSymbol[][] {
  return Array.from({ length: REEL_COUNT }, () =>
    Array.from({ length: ROW_COUNT }, () => SYMBOLS.JACK as TempleSymbol),
  );
}

function createInitialState(bet: number): TempleState {
  return {
    version: 1,
    bet,
    reels: emptyGrid(),
    lastWin: 0,
    lastLines: [],
    lastScatters: 0,
    teamMeter: 0,
    teamBonusCount: 0,
    roundId: null,
    pendingBonusChoice: null,
    bonus: { active: false, path: null, spinsRemaining: 0, multiplier: 1, totalBonusWin: 0 },
    lastBonusResult: null,
  };
}

/**
 * Evaluates the 20 paylines.
 *
 * Zeus is wild and substitutes for every non-scatter symbol. A line resolves on
 * the leading symbol (or the first non-wild symbol if the line opens with
 * Zeus), and payouts are floored per line so the amounts shown to players always
 * add up to the credits actually paid.
 */
export function evaluatePaylines(
  grid: TempleSymbol[][],
  bet: number,
): { lines: WinningLineView[]; total: number } {
  const lineBet = bet / LINES;
  const lines: WinningLineView[] = [];

  PAYLINES.forEach((rows, index) => {
    const cells: TempleSymbol[] = [];
    for (let reel = 0; reel < REEL_COUNT; reel += 1) {
      const row = rows[reel] ?? 0;
      cells.push(grid[reel]?.[row] ?? SYMBOLS.JACK);
    }

    const first = cells[0] as TempleSymbol;
    if (isScatter(first)) return;

    let base: TempleSymbol;
    if (isWild(first)) {
      const anchor = cells.find((cell) => !isWild(cell) && !isScatter(cell));
      base = anchor ?? WILD_SYMBOL;
    } else {
      base = first;
    }

    let count = 0;
    for (const cell of cells) {
      if (cell === base || isWild(cell)) count += 1;
      else break;
    }
    if (count < MIN_MATCH) return;

    const multiplier = lineMultiplier(base, count);
    if (multiplier <= 0) return;

    lines.push({
      line: index + 1,
      symbol: base,
      count,
      payout: Math.floor(multiplier * lineBet * PAYOUT_SCALE),
      positions: Array.from(
        { length: count },
        (_, reel) => reel * ROW_COUNT + (rows[reel] ?? 0),
      ),
    });
  });

  return { lines, total: lines.reduce((sum, line) => sum + line.payout, 0) };
}

function buildBonusChoice(
  trigger: "scatter" | "team",
  config: TempleMultiplayerConfig,
): TempleBonusChoiceView {
  const order: BonusPath[] = ["LIGHTNING", "SHIELD"];
  return {
    trigger,
    options: order.map((id) => {
      const path = config.bonusPaths[id];
      return {
        id,
        label: path.label,
        description: path.description,
        spins: path.spins,
        multiplier: path.multiplier,
      };
    }),
  };
}

/** Plays a bonus round to completion and reports every free spin for replay. */
export function runBonus(
  path: BonusPath,
  trigger: "scatter" | "team",
  bet: number,
  ctx: GameContext,
  config: TempleMultiplayerConfig = TEMPLE_MULTIPLAYER,
): TempleBonusResultView {
  const base = config.bonusPaths[path];
  const isTeam = trigger === "team";
  const spinCount = base.spins + (isTeam ? config.teamBonusBoost.extraSpins : 0);
  const multiplier = base.multiplier + (isTeam ? config.teamBonusBoost.multiplierBonus : 0);
  const spins: TempleFreeSpinView[] = [];
  let totalWin = 0;

  for (let spin = 0; spin < spinCount; spin += 1) {
    const grid = spinGrid(ctx.rng);
    const evaluation = evaluatePaylines(grid, bet);
    const scaledLines = evaluation.lines.map((line) => ({
      ...line,
      payout: Math.floor(line.payout * multiplier),
    }));
    const win = scaledLines.reduce((sum, line) => sum + line.payout, 0);
    totalWin += win;
    spins.push({ reels: grid, win, winningLines: scaledLines });
  }

  return { path, trigger, multiplier, spins, totalWin };
}

function toView(state: TempleState): TempleOfZeusView {
  return {
    game: "temple-of-zeus",
    reels: state.reels,
    lastWin: state.lastWin,
    lastLines: state.lastLines,
    lastScatters: state.lastScatters,
    teamMeter: state.teamMeter,
    teamMeterTarget: TEMPLE_MULTIPLAYER.meterTarget,
    teamBonusUnlocked: state.teamMeter >= TEMPLE_MULTIPLAYER.meterTarget,
    teamBonusCount: state.teamBonusCount,
    bonus: state.bonus,
    pendingBonusChoice: state.pendingBonusChoice,
    lastBonusResult: state.lastBonusResult,
    roundId: state.roundId,
  };
}

function rejected(state: TempleState, reason: string): RoundResolution<TempleState> {
  return {
    state,
    payout: 0,
    bonusTriggered: false,
    accepted: false,
    reason,
    events: [],
    view: toView(state),
  };
}

export const templeOfZeus: GameEngine<TempleState, TempleAction> = {
  slug: TEMPLE_SLUG,
  name: "Temple of Zeus",
  type: "SLOT",
  multiplayerEnabled: true,
  betLevels: BET_LEVELS,
  defaultBet: DEFAULT_BET,

  createState(config?: GameConfig): TempleState {
    const bet = typeof config?.bet === "number" ? config.bet : DEFAULT_BET;
    const state = createInitialState(bet);
    if (typeof config?.teamMeter === "number") {
      state.teamMeter = Math.min(TEMPLE_MULTIPLAYER.meterTarget, config.teamMeter);
    }
    return state;
  },

  hydrate(raw: unknown): TempleState {
    if (!raw || typeof raw !== "object") return createInitialState(DEFAULT_BET);
    const candidate = raw as Partial<TempleState>;
    if (candidate.version !== 1 || !Array.isArray(candidate.reels)) {
      return createInitialState(DEFAULT_BET);
    }
    return {
      ...createInitialState(candidate.bet ?? DEFAULT_BET),
      ...candidate,
      version: 1,
      reels: candidate.reels,
      bonus: candidate.bonus ?? createInitialState(DEFAULT_BET).bonus,
    } as TempleState;
  },

  serialize(state: TempleState): unknown {
    return state;
  },

  getState(state: TempleState): GameView {
    return toView(state);
  },

  placeBet(state: TempleState, bet: number): BetAcceptance<TempleState> {
    if (!Number.isInteger(bet) || bet <= 0 || bet > MAX_BET) {
      return { state, accepted: false, bet: state.bet, reason: "Invalid bet amount", events: [] };
    }
    return {
      state: { ...state, bet },
      accepted: true,
      bet,
      events: [{ type: "BET_ACCEPTED", payload: { bet } }],
    };
  },

  resolveRound(state: TempleState, ctx: GameContext): RoundResolution<TempleState> {
    if (state.pendingBonusChoice) {
      return rejected(state, "Resolve the bonus choice before spinning again");
    }
    if (!state.bet || state.bet <= 0) {
      return rejected(state, "Place a bet before spinning");
    }

    const bet = state.bet;
    const lineBet = bet / LINES;
    const grid = spinGrid(ctx.rng);
    const evaluation = evaluatePaylines(grid, bet);
    const scatterCount = countSymbol(grid, SCATTER_SYMBOL);
    const scatterWin = Math.floor(scatterMultiplier(scatterCount) * lineBet * PAYOUT_SCALE);
    let payout = evaluation.total + scatterWin;

    const lightning = countSymbol(grid, SYMBOLS.LIGHTNING);
    let teamMeter = state.teamMeter;
    let teamBonusCount = state.teamBonusCount;
    let lastBonusResult = state.lastBonusResult;
    let bonus: TempleBonusState = {
      active: false,
      path: null,
      spinsRemaining: 0,
      multiplier: 1,
      totalBonusWin: 0,
    };

    let pending: TempleBonusChoiceView | null = null;
    if (scatterCount >= SCATTER_TRIGGER_COUNT) {
      pending = buildBonusChoice("scatter", TEMPLE_MULTIPLAYER);
    } else {
      if (teamMeter < TEMPLE_MULTIPLAYER.meterTarget) {
        teamMeter = Math.min(
          TEMPLE_MULTIPLAYER.meterTarget,
          teamMeter + lightning * TEMPLE_MULTIPLAYER.meterPerLightning,
        );
      }
      if (teamMeter >= TEMPLE_MULTIPLAYER.meterTarget) {
        pending = buildBonusChoice("team", TEMPLE_MULTIPLAYER);
      }
    }

    const bonusTriggered = pending !== null;

    // Solo play resolves the bonus straight away; a shared session defers it so
    // the participants can vote on the path together.
    if (pending && !ctx.multiplayer) {
      const trigger = pending.trigger;
      const option = ctx.rng.pick(pending.options);
      const result = runBonus(option.id, trigger, bet, ctx);
      payout += result.totalWin;
      lastBonusResult = result;
      bonus = {
        active: false,
        path: option.id,
        spinsRemaining: 0,
        multiplier: option.multiplier,
        totalBonusWin: result.totalWin,
      };
      if (trigger === "team") {
        teamMeter = 0;
        teamBonusCount += 1;
      }
      pending = null;
    } else if (pending) {
      bonus = { ...bonus, active: true };
    }

    const next: TempleState = {
      ...state,
      reels: grid,
      lastWin: payout,
      lastLines: evaluation.lines,
      lastScatters: scatterCount,
      teamMeter,
      teamBonusCount,
      roundId: ctx.roundId,
      pendingBonusChoice: pending,
      bonus,
      lastBonusResult,
    };

    const events: GameEvent[] = [
      { type: "ROUND_STARTED", payload: { roundId: ctx.roundId, bet } },
      {
        type: "ROUND_RESULT",
        payload: { roundId: ctx.roundId, reels: grid, lines: evaluation.lines, scatterCount },
      },
      { type: "PAYOUT", payload: { roundId: ctx.roundId, payout } },
      { type: "GAME_STATE_CHANGED", payload: { teamMeter, roundId: ctx.roundId } },
    ];
    if (bonusTriggered) {
      events.push({
        type: "BONUS_TRIGGERED",
        payload: { roundId: ctx.roundId, trigger: pending?.trigger ?? null },
      });
    }

    return { state: next, payout, bonusTriggered, accepted: true, events, view: toView(next) };
  },

  performAction(
    state: TempleState,
    action: TempleAction,
    ctx: GameContext,
  ): ActionResolution<TempleState> {
    if (action.kind !== "choose-bonus-path") {
      return { ...rejected(state, "Unsupported action"), accepted: false };
    }
    const pending = state.pendingBonusChoice;
    if (!pending) {
      return { ...rejected(state, "No bonus is pending"), accepted: false };
    }
    const option = pending.options.find((entry) => entry.id === action.path);
    if (!option) {
      return { ...rejected(state, "Unknown bonus path"), accepted: false };
    }

    const result = runBonus(action.path, pending.trigger, state.bet, ctx);
    const isTeam = pending.trigger === "team";
    const next: TempleState = {
      ...state,
      pendingBonusChoice: null,
      lastBonusResult: result,
      teamMeter: isTeam ? 0 : state.teamMeter,
      teamBonusCount: isTeam ? state.teamBonusCount + 1 : state.teamBonusCount,
      bonus: {
        active: false,
        path: action.path,
        spinsRemaining: 0,
        multiplier: result.multiplier,
        totalBonusWin: result.totalWin,
      },
    };

    return {
      state: next,
      payout: result.totalWin,
      bonusTriggered: false,
      accepted: true,
      events: [
        {
          type: "BONUS_TRIGGERED",
          payload: { path: action.path, trigger: pending.trigger, totalWin: result.totalWin },
        },
        { type: "PAYOUT", payload: { payout: result.totalWin } },
        { type: "GAME_STATE_CHANGED", payload: { teamMeter: next.teamMeter } },
      ],
      view: toView(next),
    };
  },
};

export { CELLS_PER_SPIN, LINES, PAYLINES, SCATTER_SYMBOL, SYMBOLS, WILD_SYMBOL };
export type { TempleSymbol };
