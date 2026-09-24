import type {
  AnalyticsEventName,
  GameType,
  InvitationStatus,
  LedgerEntryType,
  SessionStatus,
  VoteRule,
  VoteStatus,
  VoteType,
} from "./enums";
import type { GameView } from "./games";

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
}

export interface ParticipantView extends PublicUser {
  contribution: number;
  /** Basis points, 10000 = 100%. */
  ownershipBp: number;
  isController: boolean;
  finalSettlement: number | null;
  joinedAt: string;
  leftAt: string | null;
  /** Live presence, filled in from the realtime layer. */
  online: boolean;
}

export interface LedgerEntryView {
  seq: number;
  type: LedgerEntryType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  actorId: string | null;
  actorName: string | null;
  metadata: Record<string, unknown> | null;
  entryHash: string;
  prevHash: string | null;
  createdAt: string;
}

export interface ActivityView {
  id: string;
  sessionId: string;
  userId: string | null;
  displayName: string | null;
  type: string;
  message: string;
  createdAt: string;
}

export interface ChatMessageView {
  id: string;
  sessionId: string;
  userId: string;
  displayName: string;
  avatar: string | null;
  body: string;
  createdAt: string;
}

export interface ReactionView {
  id: string;
  sessionId: string;
  userId: string;
  displayName: string;
  emoji: string;
  createdAt: string;
}

export interface VoteResponseView {
  userId: string;
  displayName: string;
  choice: string;
  createdAt: string;
}

export interface VoteTally {
  yes: number;
  no: number;
  total: number;
  eligible: number;
  /** choice -> count, for multi-option votes such as BONUS_OPTION. */
  byChoice: Record<string, number>;
  leader: string | null;
}

export interface VoteView {
  id: string;
  sessionId: string;
  type: VoteType;
  status: VoteStatus;
  rule: VoteRule;
  payload: Record<string, unknown> | null;
  createdById: string;
  createdByName: string;
  responses: VoteResponseView[];
  tally: VoteTally;
  createdAt: string;
  resolvedAt: string | null;
}

export interface SessionView {
  id: string;
  code: string;
  status: SessionStatus;
  game: {
    id: string;
    slug: string;
    name: string;
    type: GameType;
    multiplayerEnabled: boolean;
  };
  hostId: string;
  maxParticipants: number;
  initialBankroll: number;
  currentBankroll: number;
  profit: number;
  currentControllerId: string | null;
  spinCount: number;
  controlRotationEvery: number;
  rngMode: string;
  createdAt: string;
  startedAt: string | null;
  closedAt: string | null;
  participants: ParticipantView[];
  ledger: LedgerEntryView[];
  activity: ActivityView[];
  chat: ChatMessageView[];
  /** Pending "X wants control" requests, visible to the controller. */
  controlRequests: { byUserId: string; byName: string; requestedAt: string }[];
  gameState: GameView;
  openVote: VoteView | null;
  inviteToken: string | null;
}

export interface SessionSummary {
  id: string;
  code: string;
  status: SessionStatus;
  gameName: string;
  gameSlug: string;
  hostName: string;
  participantCount: number;
  initialBankroll: number;
  currentBankroll: number;
  profit: number;
  createdAt: string;
  closedAt: string | null;
}

/** What a recipient sees before they join. */
export interface InvitationPreview {
  token: string;
  status: InvitationStatus;
  sessionId: string;
  sessionCode: string;
  gameName: string;
  gameSlug: string;
  senderName: string;
  senderAvatar: string | null;
  suggestedContribution: number;
  existingContribution: number;
  participantCount: number;
  currentBankroll: number;
  alreadyJoined: boolean;
  sessionStatus: SessionStatus;
  expiresAt: string | null;
}

export interface SettlementShare {
  userId: string;
  displayName: string;
  contribution: number;
  ownershipBp: number;
  share: number;
  profit: number;
}

export interface SettlementResult {
  sessionId: string;
  initialBankroll: number;
  finalBankroll: number;
  profit: number;
  shares: SettlementShare[];
  closedAt: string;
}

export interface SessionHistoryItem extends SessionSummary {
  myContribution: number;
  mySettlement: number | null;
  myOwnershipBp: number;
}

export interface ResponsibleGamingSettingsView {
  dailyDemoLimit: number | null;
  sessionDurationReminderMin: number | null;
  lossLimit: number | null;
  breakUntil: string | null;
}

export interface AnalyticsEventInput {
  name: AnalyticsEventName;
  userId?: string | null;
  sessionId?: string | null;
  squadId?: string | null;
  props?: Record<string, unknown>;
}

export interface ApiError {
  error: string;
}
