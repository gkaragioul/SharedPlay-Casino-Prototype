import { prisma } from "@sharedplay/db";
import { getGameEngine } from "@sharedplay/games";
import { defaultRuleFor, tallyVote } from "@sharedplay/sharedplay";
import type {
  ActivityView,
  ChatMessageView,
  InvitationPreview,
  LedgerEntryView,
  ParticipantView,
  SessionSummary,
  SessionStatus,
  SessionView,
  VoteRule,
  VoteType,
  VoteView,
} from "@sharedplay/types";
import { presence } from "./presence";
import { readPersistedState } from "./state";
import { SessionError } from "./errors";

/* ------------------------------------------------------------------ votes */

type VoteRow = {
  id: string;
  sessionId: string;
  type: string;
  status: string;
  rule: string;
  payload: unknown;
  createdById: string;
  createdAt: Date;
  resolvedAt: Date | null;
  createdBy: { displayName: string };
  responses: { userId: string; choice: string; createdAt: Date; user: { displayName: string } }[];
};

export function buildVoteView(vote: VoteRow, eligibleUserIds: string[]): VoteView {
  const payload = (vote.payload ?? {}) as Record<string, unknown>;
  const optionOrder = Array.isArray(payload.options)
    ? (payload.options as { id: string }[]).map((option) => option.id)
    : undefined;

  const outcome = tallyVote({
    type: vote.type as VoteType,
    rule: (vote.rule || defaultRuleFor(vote.type as VoteType)) as VoteRule,
    eligibleUserIds,
    responses: vote.responses.map((response) => ({
      userId: response.userId,
      choice: response.choice,
      createdAt: response.createdAt,
    })),
    optionOrder,
  });

  // While the row is still OPEN the live tally may already be decisive — that
  // is what lets an early majority (or a leaver) finish the vote. Closed rows
  // keep their stored status so a cancelled vote never reopens.
  const status =
    vote.status === "OPEN" ? outcome.status : (vote.status as VoteView["status"]);

  return {
    id: vote.id,
    sessionId: vote.sessionId,
    type: vote.type as VoteType,
    status,
    rule: vote.rule as VoteRule,
    payload,
    createdById: vote.createdById,
    createdByName: vote.createdBy.displayName,
    responses: vote.responses.map((response) => ({
      userId: response.userId,
      displayName: response.user.displayName,
      choice: response.choice,
      createdAt: response.createdAt.toISOString(),
    })),
    tally: {
      yes: outcome.yes,
      no: outcome.no,
      total: outcome.total,
      eligible: outcome.eligible,
      byChoice: outcome.byChoice,
      leader: outcome.leader,
    },
    createdAt: vote.createdAt.toISOString(),
    resolvedAt: vote.resolvedAt ? vote.resolvedAt.toISOString() : null,
  };
}

/* --------------------------------------------------------------- session */

type SessionRow = NonNullable<Awaited<ReturnType<typeof fetchSessionRow>>>;

async function fetchSessionRow(sessionId: string) {
  return prisma.sharedSession.findUnique({
    where: { id: sessionId },
    include: {
      game: true,
      participants: {
        orderBy: { joinedAt: "asc" as const },
        include: {
          user: { select: { id: true, username: true, displayName: true, avatar: true } },
        },
      },
      ledger: {
        orderBy: { seq: "desc" as const },
        take: 200,
        include: { actor: { select: { displayName: true } } },
      },
      activities: { orderBy: { createdAt: "desc" as const }, take: 40 },
      chatMessages: {
        orderBy: { createdAt: "desc" as const },
        take: 100,
        include: { user: { select: { displayName: true, avatar: true } } },
      },
      votes: {
        where: { status: "OPEN" },
        orderBy: { createdAt: "desc" as const },
        take: 1,
        include: {
          createdBy: { select: { displayName: true } },
          responses: { include: { user: { select: { displayName: true } } } },
        },
      },
      invitations: {
        where: { recipientId: null },
        orderBy: { createdAt: "desc" as const },
        take: 1,
      },
    },
  });
}

function toLedgerView(
  row: SessionRow["ledger"][number],
): LedgerEntryView {
  return {
    seq: row.seq,
    type: row.type as LedgerEntryView["type"],
    amount: row.amount,
    balanceBefore: row.balanceBefore,
    balanceAfter: row.balanceAfter,
    actorId: row.actorId,
    actorName: row.actor?.displayName ?? null,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    entryHash: row.entryHash,
    prevHash: row.prevHash,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Full, server-authoritative snapshot of a shared session. */
export async function buildSessionView(sessionId: string): Promise<SessionView> {
  const session = await fetchSessionRow(sessionId);
  if (!session) throw new SessionError("NOT_FOUND", "Session not found");

  const online = presence.onlineIn(sessionId);
  const participants: ParticipantView[] = session.participants.map((row) => ({
    id: row.user.id,
    username: row.user.username,
    displayName: row.user.displayName,
    avatar: row.user.avatar,
    contribution: row.contribution,
    ownershipBp: row.ownershipBp,
    isController: row.userId === session.currentControllerId,
    finalSettlement: row.finalSettlement,
    joinedAt: row.joinedAt.toISOString(),
    leftAt: row.leftAt ? row.leftAt.toISOString() : null,
    online: online.has(row.userId),
  }));

  // Activity rows carry a bare userId; batch-resolve display names.
  const activityUserIds = [
    ...new Set(session.activities.map((row) => row.userId).filter((id): id is string => !!id)),
  ];
  const activityUsers = activityUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: activityUserIds } },
        select: { id: true, displayName: true },
      })
    : [];
  const nameById = new Map(activityUsers.map((user) => [user.id, user.displayName]));

  const activity: ActivityView[] = session.activities
    .map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      userId: row.userId,
      displayName: row.userId ? nameById.get(row.userId) ?? null : null,
      type: row.type,
      message: row.message,
      createdAt: row.createdAt.toISOString(),
    }))
    .reverse();

  const chat: ChatMessageView[] = session.chatMessages
    .map((row) => ({
      id: row.id,
      sessionId: session.id,
      userId: row.userId,
      displayName: row.user.displayName,
      avatar: row.user.avatar,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
    }))
    .reverse();

  const openVoteRow = session.votes[0] ?? null;
  const persisted = readPersistedState(session.stateJson);

  let gameState: SessionView["gameState"] = null;
  const engine = getGameEngine(session.game.slug);
  if (engine && persisted.gameState && session.status !== "LOBBY") {
    gameState = engine.getState(engine.hydrate(persisted.gameState));
  }

  const activeIds = session.participants
    .filter((row) => !row.leftAt)
    .map((row) => row.userId);

  return {
    id: session.id,
    code: session.code,
    status: session.status as SessionStatus,
    game: {
      id: session.game.id,
      slug: session.game.slug,
      name: session.game.name,
      type: session.game.type as SessionView["game"]["type"],
      multiplayerEnabled: session.game.multiplayerEnabled,
    },
    hostId: session.hostId,
    maxParticipants: session.maxParticipants,
    initialBankroll: session.initialBankroll,
    currentBankroll: session.currentBankroll,
    profit: session.currentBankroll - session.initialBankroll,
    currentControllerId: session.currentControllerId,
    spinCount: session.spinCount,
    controlRotationEvery: session.controlRotationEvery,
    rngMode: session.rngMode,
    createdAt: session.createdAt.toISOString(),
    startedAt: session.startedAt ? session.startedAt.toISOString() : null,
    closedAt: session.closedAt ? session.closedAt.toISOString() : null,
    participants,
    ledger: [...session.ledger].reverse().map(toLedgerView),
    activity,
    chat,
    controlRequests: persisted.controlRequests.map((request) => ({
      byUserId: request.byUserId,
      byName: request.byName,
      requestedAt: request.requestedAt,
    })),
    gameState,
    openVote: openVoteRow ? buildVoteView(openVoteRow, activeIds) : null,
    inviteToken: session.invitations[0]?.token ?? null,
  };
}

export function buildSessionSummary(
  session: {
    id: string;
    code: string;
    status: string;
    initialBankroll: number;
    currentBankroll: number;
    createdAt: Date;
    closedAt: Date | null;
    host: { displayName: string };
    game: { name: string; slug: string };
    participants: { userId: string; leftAt: Date | null }[];
    _count?: { rounds: number };
  },
  viewerId?: string,
): SessionSummary & { viewerParticipant?: boolean } {
  return {
    id: session.id,
    code: session.code,
    status: session.status as SessionSummary["status"],
    gameName: session.game.name,
    gameSlug: session.game.slug,
    hostName: session.host.displayName,
    participantCount: session.participants.filter((row) => !row.leftAt).length,
    initialBankroll: session.initialBankroll,
    currentBankroll: session.currentBankroll,
    profit: session.currentBankroll - session.initialBankroll,
    createdAt: session.createdAt.toISOString(),
    closedAt: session.closedAt ? session.closedAt.toISOString() : null,
    viewerParticipant: viewerId
      ? session.participants.some((row) => row.userId === viewerId)
      : undefined,
  };
}

/* ------------------------------------------------------------ invitation */

export async function buildInvitationPreview(
  token: string,
  viewerId?: string,
): Promise<InvitationPreview> {
  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: {
      sender: { select: { displayName: true, avatar: true } },
      session: {
        include: {
          game: true,
          participants: true,
        },
      },
    },
  });
  if (!invitation) throw new SessionError("NOT_FOUND", "This invitation link is not valid.");
  return previewFrom(invitation, viewerId);
}

/** Preview by session code (join-by-code flow). */
export async function buildCodePreview(code: string, viewerId?: string): Promise<InvitationPreview> {
  const session = await prisma.sharedSession.findFirst({
    where: { code: { equals: code.trim().toUpperCase() } },
    include: {
      game: true,
      participants: true,
      host: { select: { displayName: true, avatar: true } },
      invitations: {
        where: { recipientId: null },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  if (!session) throw new SessionError("NOT_FOUND", `No session found for code ${code}.`);

  const invitation = await prisma.invitation.findFirst({
    where: { sessionId: session.id, recipientId: null },
    orderBy: { createdAt: "desc" },
    include: {
      sender: { select: { displayName: true, avatar: true } },
      session: { include: { game: true, participants: true } },
    },
  });
  if (invitation) return previewFrom(invitation, viewerId);

  const alreadyJoined = viewerId
    ? session.participants.some((row) => row.userId === viewerId)
    : false;
  const existing = viewerId
    ? session.participants.find((row) => row.userId === viewerId)
    : undefined;
  return {
    token: "",
    status: "PENDING",
    sessionId: session.id,
    sessionCode: session.code,
    gameName: session.game.name,
    gameSlug: session.game.slug,
    senderName: session.host.displayName,
    senderAvatar: session.host.avatar,
    suggestedContribution: session.initialBankroll,
    existingContribution: existing?.contribution ?? 0,
    participantCount: session.participants.length,
    currentBankroll: session.currentBankroll,
    alreadyJoined,
    sessionStatus: session.status as InvitationPreview["sessionStatus"],
    expiresAt: null,
  };
}

function previewFrom(
  invitation: {
    token: string;
    status: string;
    suggestedContribution: number | null;
    expiresAt: Date | null;
    sender: { displayName: string; avatar: string | null };
    session: {
      id: string;
      code: string;
      status: string;
      currentBankroll: number;
      initialBankroll: number;
      game: { name: string; slug: string };
      participants: { userId: string; contribution: number }[];
    };
  },
  viewerId?: string,
): InvitationPreview {
  const existing = viewerId
    ? invitation.session.participants.find((row) => row.userId === viewerId)
    : undefined;
  return {
    token: invitation.token,
    status: invitation.status as InvitationPreview["status"],
    sessionId: invitation.session.id,
    sessionCode: invitation.session.code,
    gameName: invitation.session.game.name,
    gameSlug: invitation.session.game.slug,
    senderName: invitation.sender.displayName,
    senderAvatar: invitation.sender.avatar,
    suggestedContribution: invitation.suggestedContribution ?? invitation.session.initialBankroll,
    existingContribution: existing?.contribution ?? 0,
    participantCount: invitation.session.participants.length,
    currentBankroll: invitation.session.currentBankroll,
    alreadyJoined: !!existing,
    sessionStatus: invitation.session.status as InvitationPreview["sessionStatus"],
    expiresAt: invitation.expiresAt ? invitation.expiresAt.toISOString() : null,
  };
}
