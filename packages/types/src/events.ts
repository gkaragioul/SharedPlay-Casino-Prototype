import type { ReactionEmoji, VoteRule, VoteType } from "./enums";
import type {
  ActivityView,
  ChatMessageView,
  LedgerEntryView,
  ParticipantView,
  ReactionView,
  SessionView,
  SettlementResult,
  VoteView,
} from "./domain";
import type { BonusBroadcast, GameView, RoundBroadcast, TempleAction } from "./games";

/** Every client -> server message is acknowledged so the UI can react to failure. */
export interface Ack<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

export type AckFn<T = undefined> = (response: Ack<T>) => void;

export interface SpinAck {
  roundId: string;
  payout: number;
  bankroll: number;
  bonusTriggered: boolean;
}

export interface ClientToServerEvents {
  "session:join": (
    payload: { sessionId: string },
    ack: AckFn<SessionView>,
  ) => void;
  "session:leave": (payload: { sessionId: string }, ack: AckFn) => void;
  "session:contribute": (
    payload: { sessionId: string; amount: number },
    ack: AckFn<SessionView>,
  ) => void;
  "session:start": (
    payload: { sessionId: string },
    ack: AckFn<SessionView>,
  ) => void;
  "game:spin": (
    payload: { sessionId: string; bet: number },
    ack: AckFn<SpinAck>,
  ) => void;
  "game:action": (
    payload: { sessionId: string; action: TempleAction },
    ack: AckFn<SessionView>,
  ) => void;
  "control:request": (
    payload: { sessionId: string },
    ack: AckFn,
  ) => void;
  "control:pass": (
    payload: { sessionId: string; toUserId?: string },
    ack: AckFn<SessionView>,
  ) => void;
  "vote:create": (
    payload: {
      sessionId: string;
      type: VoteType;
      payload?: Record<string, unknown>;
      rule?: VoteRule;
    },
    ack: AckFn<VoteView>,
  ) => void;
  "vote:cast": (
    payload: { sessionId: string; voteId: string; choice: string },
    ack: AckFn<VoteView>,
  ) => void;
  "chat:send": (
    payload: { sessionId: string; body: string },
    ack: AckFn<ChatMessageView>,
  ) => void;
  "reaction:send": (
    payload: { sessionId: string; emoji: ReactionEmoji },
    ack: AckFn,
  ) => void;
  "session:close": (
    payload: { sessionId: string },
    ack: AckFn<SettlementResult>,
  ) => void;
}

export interface ServerToClientEvents {
  "session:state": (payload: SessionView) => void;
  "session:participants": (payload: ParticipantView[]) => void;
  "bankroll:updated": (payload: {
    currentBankroll: number;
    initialBankroll: number;
    delta: number;
  }) => void;
  "ledger:entry": (payload: LedgerEntryView) => void;
  "game:state": (payload: { game: GameView; spinCount: number }) => void;
  "game:round": (payload: RoundBroadcast) => void;
  /** A group free-spins result, sent before the new session state. */
  "game:bonus": (payload: BonusBroadcast) => void;
  "control:changed": (payload: {
    currentControllerId: string | null;
    reason: string;
    byName?: string;
  }) => void;
  "control:requested": (payload: {
    byUserId: string;
    byName: string;
    requestedAt: string;
  }) => void;
  "vote:started": (payload: VoteView) => void;
  "vote:updated": (payload: VoteView) => void;
  "vote:completed": (payload: VoteView) => void;
  "chat:message": (payload: ChatMessageView) => void;
  "reaction": (payload: ReactionView) => void;
  "activity": (payload: ActivityView) => void;
  "session:settled": (payload: SettlementResult) => void;
  "session:closed": (payload: { sessionId: string }) => void;
  "session:expired": (payload: { sessionId: string; reason: string }) => void;
  /** Live presence for friends/squads lists. */
  presence: (payload: { userId: string; online: boolean }) => void;
  /** Pushes a freshly created notification to the bell. */
  notification: (payload: {
    id: string;
    type: string;
    title: string;
    body: string | null;
    createdAt: string;
  }) => void;
  error: (payload: { message: string }) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

/** Attached to every socket after authentication. */
export interface SocketData {
  userId: string;
  username: string;
  displayName: string;
}
