/**
 * Shape of `SharedSession.stateJson` — everything the session needs that is
 * not a first-class column: game state, pending control requests, large-bet
 * approvals and demo-script flags.
 */
export interface ControlRequestState {
  byUserId: string;
  byName: string;
  requestedAt: string;
}

export interface SessionFlags {
  /** Set only by /investor-demo — drives the scripted Nick bot. */
  demoBot?: boolean;
  /** Which seeded account plays the bot (nick, alex or helen). */
  demoBotUserId?: string;
  /** Script step counter for the demo sequence. */
  demoStep?: number;
}

export interface SessionPersistedState {
  gameState: unknown | null;
  controlRequests: ControlRequestState[];
  largeBetApproval: { bet: number; voteId: string } | null;
  flags: SessionFlags;
}

export const EMPTY_SESSION_STATE: SessionPersistedState = {
  gameState: null,
  controlRequests: [],
  largeBetApproval: null,
  flags: {},
};

export function readPersistedState(raw: unknown): SessionPersistedState {
  if (!raw || typeof raw !== "object") return { ...EMPTY_SESSION_STATE, flags: {} };
  const candidate = raw as Partial<SessionPersistedState>;
  return {
    gameState: candidate.gameState ?? null,
    controlRequests: Array.isArray(candidate.controlRequests) ? candidate.controlRequests : [],
    largeBetApproval:
      candidate.largeBetApproval && typeof candidate.largeBetApproval.bet === "number"
        ? candidate.largeBetApproval
        : null,
    flags:
      candidate.flags && typeof candidate.flags === "object"
        ? { ...candidate.flags }
        : {},
  };
}

export function writePersistedState(state: SessionPersistedState): Record<string, unknown> {
  return {
    gameState: state.gameState ?? null,
    controlRequests: state.controlRequests,
    largeBetApproval: state.largeBetApproval,
    flags: state.flags,
  };
}
