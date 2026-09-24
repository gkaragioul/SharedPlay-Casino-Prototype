import { randomUUID } from "node:crypto";
import type { Prisma } from "@sharedplay/db";
import { prisma } from "@sharedplay/db";
import { createRng, getGameEngine, type GameContext } from "@sharedplay/games";
import {
  MIN_CONTRIBUTION,
  appendLedgerEntry,
  bonusStake,
  calculateOwnership,
  clearControlRequest,
  defaultRuleFor,
  generateInviteToken,
  generateSessionCode,
  isLargeBet,
  nextController,
  resolveControlAfterSpin,
  settleShares,
  tallyVote,
  upsertControlRequest,
  validateBet,
  validateContribution,
  type PendingControlRequest,
} from "@sharedplay/sharedplay";
import type {
  BonusPath,
  ChatMessageView,
  LedgerEntryType,
  ReactionEmoji,
  SessionView,
  SettlementResult,
  SpinAck,
  TempleAction,
  TempleOfZeusView,
  VoteRule,
  VoteType,
  VoteView,
} from "@sharedplay/types";
import { DEFAULT_CONTROL_ROTATION_EVERY, isReactionEmoji } from "@sharedplay/types";
import { notify, recordActivity, track } from "../../src/lib/analytics";
import { formatSignedCredits } from "../../src/lib/format";
import { getIo, pushNotification } from "./bus";
import {
  demoBonusOptions,
  isDemoSession,
  onDemoControlChanged,
  onDemoSessionCreated,
  onDemoSessionStarted,
  onDemoSpin,
  onDemoVoteCreated,
  registerBotDrivers,
} from "./bots";
import { SessionError } from "./errors";
import { withSessionLock, withUserLock } from "./lock";
import { checkResponsibleGaming } from "./rg";
import { readPersistedState, writePersistedState } from "./state";
import { buildSessionView, buildVoteView } from "./view";

type LedgerHost = { id: string; ledgerSeq: number; lastLedgerHash: string | null };

const room = (sessionId: string) => `session:${sessionId}`;

async function broadcast(sessionId: string): Promise<SessionView> {
  const view = await buildSessionView(sessionId);
  getIo()?.to(room(sessionId)).emit("session:state", view);
  return view;
}

async function appendLedger(
  tx: Prisma.TransactionClient,
  host: LedgerHost,
  entry: {
    type: LedgerEntryType;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    actorId: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const seq = host.ledgerSeq + 1;
  const linked = appendLedgerEntry(
    {
      seq,
      type: entry.type,
      amount: entry.amount,
      balanceBefore: entry.balanceBefore,
      balanceAfter: entry.balanceAfter,
      actorId: entry.actorId,
      metadata: entry.metadata ?? null,
      createdAt: new Date(),
    },
    host.lastLedgerHash,
  );
  await tx.sessionLedgerEntry.create({
    data: {
      sessionId: host.id,
      seq,
      type: entry.type,
      amount: entry.amount,
      balanceBefore: entry.balanceBefore,
      balanceAfter: entry.balanceAfter,
      actorId: entry.actorId,
      metadata: jsonOrUndefined(entry.metadata),
      prevHash: linked.prevHash,
      entryHash: linked.entryHash,
      createdAt: linked.createdAt,
    },
  });
  await tx.sharedSession.update({
    where: { id: host.id },
    data: { ledgerSeq: seq, lastLedgerHash: linked.entryHash },
  });
  host.ledgerSeq = seq;
  host.lastLedgerHash = linked.entryHash;
}

function rngFor(session: { rngMode: string; rngSeed: string | null; spinCount: number }) {
  if (session.rngMode === "seeded") {
    return createRng({ mode: "seeded", seed: `${session.rngSeed ?? "demo"}:${session.spinCount}` });
  }
  return createRng({ mode: "random" });
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function jsonOrUndefined(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return value as Prisma.InputJsonValue;
}

/** Persisted control requests store ISO strings; sharedplay helpers use Date. */
function toPendingRequests(
  states: { byUserId: string; byName: string; requestedAt: string }[],
): PendingControlRequest[] {
  return states.map((row) => ({
    byUserId: row.byUserId,
    byName: row.byName,
    requestedAt: new Date(row.requestedAt),
  }));
}

function toControlStates(
  pending: PendingControlRequest[],
): { byUserId: string; byName: string; requestedAt: string }[] {
  return pending.map((row) => ({
    byUserId: row.byUserId,
    byName: row.byName,
    requestedAt:
      row.requestedAt instanceof Date
        ? row.requestedAt.toISOString()
        : String(row.requestedAt),
  }));
}

const VOTE_LABELS: Record<string, string> = {
  CASH_OUT: "Cash out the session?",
  LARGE_BET: "Approve this large bet?",
  PASS_CONTROL: "Pass control?",
  BONUS_OPTION: "Choose the bonus path",
};

/* ====================================================================== */
/*  Create                                                                 */
/* ====================================================================== */

export interface CreateSessionInput {
  hostId: string;
  gameSlug: string;
  contribution: number;
  maxParticipants?: number;
  controlRotationEvery?: number;
  squadId?: string | null;
  demoBot?: boolean;
}

export interface CreateSessionResult {
  sessionId: string;
  code: string;
  token: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export function createSharedSession(input: CreateSessionInput): Promise<CreateSessionResult> {
  return withUserLock(input.hostId, () => createLocked(input));
}

async function createLocked(input: CreateSessionInput): Promise<CreateSessionResult> {
  const engine = getGameEngine(input.gameSlug);
  if (!engine) throw new SessionError("UNKNOWN_GAME", "That game is not available.");

  const contribution = Math.floor(input.contribution);
  if (!Number.isFinite(contribution) || contribution < MIN_CONTRIBUTION) {
    throw new SessionError(
      "INVALID_AMOUNT",
      `The minimum contribution is ${MIN_CONTRIBUTION} demo credits.`,
    );
  }
  const maxParticipants = clamp(input.maxParticipants ?? 2, 2, 8);
  const controlRotationEvery = clamp(
    input.controlRotationEvery ?? DEFAULT_CONTROL_ROTATION_EVERY,
    3,
    50,
  );
  const demoBot = input.demoBot === true;

  const game = await prisma.game.findUnique({ where: { slug: input.gameSlug } });
  if (!game) throw new SessionError("UNKNOWN_GAME", "That game is not in the catalogue.");

  // Investor demo: pick a seeded account (never the host) to play the bot.
  let demoBotUserId: string | null = null;
  if (demoBot) {
    const candidates = await prisma.user.findMany({
      where: { username: { in: ["nick", "alex", "helen"] }, id: { not: input.hostId } },
      orderBy: { username: "asc" },
    });
    const preferred =
      candidates.find((user) => user.username === "nick") ?? candidates[0] ?? null;
    demoBotUserId = preferred?.id ?? null;
  }

  const rngMode =
    demoBot || process.env.RNG_MODE === "seeded" ? "seeded" : "random";

  const created = await prisma.$transaction(
    async (tx) => {
      const host = await tx.user.findUnique({ where: { id: input.hostId } });
      if (!host) throw new SessionError("NOT_FOUND", "Account not found.");
      if (host.demoBalance < contribution) {
        throw new SessionError(
          "INSUFFICIENT_BALANCE",
          "You don't have enough demo credits for that contribution.",
        );
      }

      let code = generateSessionCode();
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const clash = await tx.sharedSession.findUnique({ where: { code } });
        if (!clash) break;
        code = generateSessionCode();
      }
      let token = generateInviteToken();
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const clash = await tx.invitation.findUnique({ where: { token } });
        if (!clash) break;
        token = generateInviteToken();
      }

      const session = await tx.sharedSession.create({
        data: {
          code,
          gameId: game.id,
          hostId: input.hostId,
          squadId: input.squadId ?? null,
          status: "LOBBY",
          initialBankroll: contribution,
          currentBankroll: contribution,
          currentControllerId: input.hostId,
          maxParticipants,
          controlRotationEvery,
          rngMode,
          rngSeed: demoBot ? `demo-${code}` : process.env.RNG_SEED || null,
          stateJson: json(
            writePersistedState({
              gameState: null,
              controlRequests: [],
              largeBetApproval: null,
              flags: demoBot
                ? { demoBot: true, demoBotUserId: demoBotUserId ?? undefined, demoStep: 0 }
                : {},
            }),
          ),
        },
      });

      const ownership = calculateOwnership([
        { userId: input.hostId, amount: contribution },
      ]);
      await tx.sessionParticipant.create({
        data: {
          sessionId: session.id,
          userId: input.hostId,
          contribution,
          ownershipBp: ownership[0]!.ownershipBp,
          isController: true,
        },
      });
      await tx.user.update({
        where: { id: input.hostId },
        data: { demoBalance: { decrement: contribution } },
      });

      const ledgerHost: LedgerHost = { id: session.id, ledgerSeq: 0, lastLedgerHash: null };
      await appendLedger(tx, ledgerHost, {
        type: "CONTRIBUTION",
        amount: contribution,
        balanceBefore: 0,
        balanceAfter: contribution,
        actorId: input.hostId,
        metadata: { note: "host" },
      });

      const invitation = await tx.invitation.create({
        data: {
          sessionId: session.id,
          senderId: input.hostId,
          token,
          status: "PENDING",
          suggestedContribution: contribution,
        },
      });

      return {
        sessionId: session.id,
        code: session.code,
        token: invitation.token,
        hostName: host.displayName,
      };
    },
    { timeout: 20_000 },
  );

  await recordActivity({
    sessionId: created.sessionId,
    userId: input.hostId,
    type: "SESSION_CREATED",
    message: `${created.hostName} opened the session with ${contribution.toLocaleString()} credits`,
  });
  track({
    name: "shared_session_created",
    userId: input.hostId,
    sessionId: created.sessionId,
    props: { gameSlug: input.gameSlug, contribution, maxParticipants, demoBot },
  });

  if (demoBot && demoBotUserId) {
    onDemoSessionCreated({
      sessionId: created.sessionId,
      botUserId: demoBotUserId,
      contribution,
    });
  }

  return {
    sessionId: created.sessionId,
    code: created.code,
    token: created.token,
  };
}

/* ====================================================================== */
/*  Join / contribute                                                      */
/* ====================================================================== */

export interface JoinSessionInput {
  sessionId?: string;
  token?: string;
  userId: string;
  amount: number;
}

export function joinSharedSession(input: JoinSessionInput): Promise<SessionView> {
  return withSessionLockForJoin(input, () => joinLocked(input));
}

async function withSessionLockForJoin<T>(
  input: JoinSessionInput,
  task: () => Promise<T>,
): Promise<T> {
  let sessionId = input.sessionId;
  if (!sessionId && input.token) {
    const invitation = await prisma.invitation.findUnique({
      where: { token: input.token },
      select: { sessionId: true },
    });
    if (!invitation) throw new SessionError("NOT_FOUND", "That invitation is not valid.");
    sessionId = invitation.sessionId;
  }
  if (!sessionId) throw new SessionError("NOT_FOUND", "No session specified.");
  const id = sessionId;
  return withSessionLock(id, () => withUserLock(input.userId, () => task()));
}

async function joinLocked(input: JoinSessionInput): Promise<SessionView> {
  let sessionId = input.sessionId ?? null;
  let invitationId: string | null = null;
  if (input.token) {
    const invitation = await prisma.invitation.findUnique({ where: { token: input.token } });
    if (!invitation) throw new SessionError("NOT_FOUND", "That invitation is not valid.");
    sessionId = invitation.sessionId;
    invitationId = invitation.id;
  }
  if (!sessionId) throw new SessionError("NOT_FOUND", "No session specified.");
  const id = sessionId;

  const session = await prisma.sharedSession.findUnique({
    where: { id },
    include: { participants: true, host: { select: { displayName: true } } },
  });
  if (!session) throw new SessionError("NOT_FOUND", "Session not found.");
  if (session.status !== "LOBBY") {
    throw new SessionError("SESSION_NOT_JOINABLE", "This session is already playing.");
  }
  const already = session.participants.some((row) => row.userId === input.userId);
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw new SessionError("NOT_FOUND", "Account not found.");

  const amount = Math.floor(input.amount);
  const check = validateContribution({
    amount,
    userBalance: user.demoBalance,
    sessionStatus: session.status,
    alreadyJoined: already,
    participantCount: session.participants.length,
    maxParticipants: session.maxParticipants,
  });
  if (!check.ok) {
    const messages: Record<string, string> = {
      INVALID_AMOUNT: "Enter a valid contribution amount.",
      BELOW_MINIMUM: `Minimum contribution is ${MIN_CONTRIBUTION} credits.`,
      ABOVE_MAXIMUM: "That contribution is above the prototype maximum.",
      INSUFFICIENT_BALANCE: "You don't have enough demo credits.",
      SESSION_NOT_JOINABLE: "This session is already playing.",
      ALREADY_JOINED: "You're already in this session.",
      SESSION_FULL: "This session is full.",
    };
    throw new SessionError(check.reason ?? "REJECTED", messages[check.reason ?? ""] ?? "You can't join right now.");
  }

  const rg = await checkResponsibleGaming(input.userId, 0);
  if (!rg.ok) throw new SessionError(rg.reason, rg.message);

  const result = await prisma.$transaction(
    async (tx) => {
      const fresh = await tx.sharedSession.findUniqueOrThrow({
        where: { id },
        include: { participants: true },
      });
      if (fresh.status !== "LOBBY") {
        throw new SessionError("SESSION_NOT_JOINABLE", "This session is already playing.");
      }
      if (fresh.participants.some((row) => row.userId === input.userId)) {
        throw new SessionError("ALREADY_JOINED", "You're already in this session.");
      }
      if (fresh.participants.length >= fresh.maxParticipants) {
        throw new SessionError("SESSION_FULL", "This session is full.");
      }
      const freshUser = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });
      if (freshUser.demoBalance < amount) {
        throw new SessionError("INSUFFICIENT_BALANCE", "You don't have enough demo credits.");
      }

      await tx.user.update({
        where: { id: input.userId },
        data: { demoBalance: { decrement: amount } },
      });

      const contributions = [
        ...fresh.participants.map((row) => ({ userId: row.userId, amount: row.contribution })),
        { userId: input.userId, amount },
      ];
      const ownership = calculateOwnership(contributions);
      await tx.sessionParticipant.create({
        data: {
          sessionId: id,
          userId: input.userId,
          contribution: amount,
          ownershipBp: ownership.find((row) => row.userId === input.userId)!.ownershipBp,
        },
      });
      for (const row of fresh.participants) {
        await tx.sessionParticipant.update({
          where: { id: row.id },
          data: {
            ownershipBp: ownership.find((entry) => entry.userId === row.userId)!.ownershipBp,
          },
        });
      }

      const ledgerHost: LedgerHost = {
        id: fresh.id,
        ledgerSeq: fresh.ledgerSeq,
        lastLedgerHash: fresh.lastLedgerHash,
      };
      await appendLedger(tx, ledgerHost, {
        type: "CONTRIBUTION",
        amount,
        balanceBefore: fresh.currentBankroll,
        balanceAfter: fresh.currentBankroll + amount,
        actorId: input.userId,
      });
      await tx.sharedSession.update({
        where: { id },
        data: {
          initialBankroll: { increment: amount },
          currentBankroll: { increment: amount },
        },
      });
      if (invitationId) {
        await tx.invitation.update({
          where: { id: invitationId },
          data: { status: "ACCEPTED", recipientId: input.userId, suggestedContribution: amount },
        });
      }
      return { participantCount: fresh.participants.length + 1 };
    },
    { timeout: 20_000 },
  );

  await recordActivity({
    sessionId: id,
    userId: input.userId,
    type: "USER_JOINED",
    message: `${user.displayName} joined with ${amount.toLocaleString()} credits`,
  });
  track({
    name: "invite_accepted",
    userId: input.userId,
    sessionId: id,
    props: { amount },
  });

  pushNotification({
    userId: session.hostId,
    id: randomUUID(),
    type: "session_join",
    title: `${user.displayName} joined your session`,
    body: `${amount.toLocaleString()} demo credits contributed — ${result.participantCount} players ready.`,
  });

  // Investor demo: the bot's join is the cue to start the table automatically.
  const persistedFlags = readPersistedState(session.stateJson).flags;
  if (isDemoSession(persistedFlags) && result.participantCount >= 2) {
    await startSessionLocked(id, session.hostId);
  }

  return broadcast(id);
}

/* ====================================================================== */
/*  Start                                                                  */
/* ====================================================================== */

export function startSharedSession(input: {
  sessionId: string;
  userId: string;
}): Promise<SessionView> {
  return withSessionLock(input.sessionId, () => startSessionLocked(input.sessionId, input.userId));
}

async function startSessionLocked(sessionId: string, byUserId: string): Promise<SessionView> {
  const session = await prisma.sharedSession.findUnique({
    where: { id: sessionId },
    include: { game: true, participants: true },
  });
  if (!session) throw new SessionError("NOT_FOUND", "Session not found.");
  if (session.status !== "LOBBY") {
    throw new SessionError("INVALID_PHASE", "This session has already started.");
  }
  if (session.hostId !== byUserId) {
    throw new SessionError("FORBIDDEN", "Only the host can start the session.");
  }
  if (session.participants.filter((row) => !row.leftAt).length < 2) {
    throw new SessionError(
      "NEED_PLAYERS",
      "Waiting for at least one friend to join before you can start.",
    );
  }

  const engine = getGameEngine(session.game.slug);
  if (!engine) throw new SessionError("UNKNOWN_GAME", "That game is not in the catalogue.");

  const persisted = readPersistedState(session.stateJson);
  const gameState = engine.createState({ bet: engine.defaultBet });

  await prisma.sharedSession.update({
    where: { id: sessionId },
    data: {
      status: "ACTIVE",
      startedAt: new Date(),
      stateJson: json(
        writePersistedState({ ...persisted, gameState: engine.serialize(gameState) }),
      ),
    },
  });
  await recordActivity({
    sessionId,
    userId: null,
    type: "SESSION_STARTED",
    message: "Session started — good luck!",
  });
  track({
    name: "shared_session_started",
    userId: byUserId,
    sessionId,
    props: { participants: session.participants.length, gameSlug: session.game.slug },
  });

  const view = await broadcast(sessionId);
  if (isDemoSession(persisted.flags) && persisted.flags.demoBotUserId) {
    onDemoSessionStarted({
      sessionId,
      botUserId: persisted.flags.demoBotUserId,
    });
  }
  return view;
}

/* ====================================================================== */
/*  Spin                                                                   */
/* ====================================================================== */

export interface SpinInput {
  sessionId: string;
  userId: string;
  bet: number;
}

export function spinShared(
  input: SpinInput,
): Promise<{ ack: SpinAck; view: SessionView }> {
  return withSessionLock(input.sessionId, () => spinLocked(input));
}

async function spinLocked(
  input: SpinInput,
): Promise<{ ack: SpinAck; view: SessionView }> {
  const { sessionId, userId } = input;
  const bet = Math.floor(input.bet);

  const session = await prisma.sharedSession.findUnique({
    where: { id: sessionId },
    include: {
      game: true,
      participants: {
        orderBy: { joinedAt: "asc" },
        include: { user: { select: { displayName: true } } },
      },
    },
  });
  if (!session) throw new SessionError("NOT_FOUND", "Session not found.");
  if (session.status !== "ACTIVE") {
    throw new SessionError("INVALID_PHASE", "The session hasn't started yet.");
  }
  if (session.currentControllerId !== userId) {
    throw new SessionError(
      "NOT_CONTROLLER",
      "Only the current controller can spin — request control first.",
    );
  }
  const controller = session.participants.find((row) => row.userId === userId);
  if (!controller || controller.leftAt) {
    throw new SessionError("NOT_PARTICIPANT", "You're not in this session.");
  }
  const engine = getGameEngine(session.game.slug);
  if (!engine) throw new SessionError("UNKNOWN_GAME", "That game is not in the catalogue.");

  // Responsible-gaming gate — a tripped limit steps the player off wagering.
  const rg = await checkResponsibleGaming(userId, bet);
  if (!rg.ok) {
    await stepBackFromWagering(session, controller.user.displayName, userId);
    await broadcast(sessionId);
    throw new SessionError(rg.reason, rg.message);
  }

  // One vote at a time; finishing it unblocks the table.
  const openVote = await prisma.vote.findFirst({
    where: { sessionId, status: "OPEN" },
    select: { id: true },
  });
  if (openVote) {
    throw new SessionError("VOTE_IN_PROGRESS", "Finish the open vote before spinning.");
  }

  const persisted = readPersistedState(session.stateJson);
  const betCheck = validateBet({
    bet,
    bankroll: session.currentBankroll,
    betLevels: engine.betLevels,
    largeBetVotePassed: persisted.largeBetApproval?.bet === bet,
  });
  if (!betCheck.ok) {
    if (betCheck.reason === "LARGE_BET_VOTE_REQUIRED") {
      await createVoteLocked({
        sessionId,
        userId,
        type: "LARGE_BET",
        payload: { bet },
      });
      // Push the open vote to the table, otherwise nobody can see or answer it.
      await broadcast(sessionId);
      throw new SessionError(
        "LARGE_BET_VOTE",
        "That's a large bet for this bankroll — everyone votes on it first.",
      );
    }
    const messages: Record<string, string> = {
      INVALID_BET: "Invalid bet amount.",
      ABOVE_MAX: "That bet is above the prototype maximum.",
      INSUFFICIENT_BANKROLL: "The shared bankroll can't cover that bet.",
      BELOW_MIN: "That bet is below the minimum.",
    };
    throw new SessionError(
      betCheck.reason ?? "INVALID_BET",
      messages[betCheck.reason ?? ""] ?? "Bet rejected.",
    );
  }

  const roundId = randomUUID();
  const beforeController = session.currentControllerId;
  const spinIndex = session.spinCount;

  const outcome = await prisma.$transaction(
    async (tx) => {
      const fresh = await tx.sharedSession.findUniqueOrThrow({ where: { id: sessionId } });
      if (fresh.currentBankroll < bet) {
        throw new SessionError("INSUFFICIENT_BANKROLL", "The shared bankroll can't cover that bet.");
      }
      const ledgerHost: LedgerHost = {
        id: fresh.id,
        ledgerSeq: fresh.ledgerSeq,
        lastLedgerHash: fresh.lastLedgerHash,
      };
      const afterBet = fresh.currentBankroll - bet;
      await appendLedger(tx, ledgerHost, {
        type: "BET",
        amount: bet,
        balanceBefore: fresh.currentBankroll,
        balanceAfter: afterBet,
        actorId: userId,
        metadata: { game: session.game.slug, roundId },
      });

      let state = engine.hydrate(persisted.gameState);
      const placed = engine.placeBet(state, bet);
      if (!placed.accepted) {
        throw new SessionError("ROUND_REJECTED", placed.reason ?? "Bet rejected.");
      }
      state = placed.state;

      const ctx: GameContext = {
        rng: rngFor({
          rngMode: session.rngMode,
          rngSeed: session.rngSeed,
          spinCount: spinIndex,
        }),
        roundId,
        multiplayer: true,
      };
      const resolution = engine.resolveRound(state, ctx);
      if (!resolution.accepted) {
        throw new SessionError("ROUND_REJECTED", resolution.reason ?? "Round rejected.");
      }

      const payout = resolution.payout;
      let bankroll = afterBet;
      if (payout > 0) {
        bankroll = afterBet + payout;
        await appendLedger(tx, ledgerHost, {
          type: "WIN",
          amount: payout,
          balanceBefore: afterBet,
          balanceAfter: bankroll,
          actorId: userId,
          metadata: { game: session.game.slug, roundId },
        });
      }

      const control = resolveControlAfterSpin({
        orderedCandidates: session.participants.map((row) => ({
          userId: row.userId,
          active: !row.leftAt,
        })),
        currentControllerId: fresh.currentControllerId,
        spinCount: fresh.spinCount + 1,
        rotationEvery: fresh.controlRotationEvery,
      });

      await tx.sharedSession.update({
        where: { id: sessionId },
        data: {
          currentBankroll: bankroll,
          spinCount: { increment: 1 },
          currentControllerId: control.controllerId,
          stateJson: json(
            writePersistedState({
              ...persisted,
              gameState: engine.serialize(resolution.state),
              largeBetApproval: null,
            }),
          ),
        },
      });
      if (control.controllerId !== fresh.currentControllerId) {
        await tx.sessionParticipant.updateMany({
          where: { sessionId },
          data: { isController: false },
        });
        if (control.controllerId) {
          await tx.sessionParticipant.update({
            where: {
              sessionId_userId: { sessionId, userId: control.controllerId },
            },
            data: { isController: true },
          });
        }
      }
      await tx.gameRound.create({
        data: {
          sessionId,
          userId,
          gameId: session.gameId,
          bet,
          payout,
          result: json(resolution.view),
          bonusTriggered: resolution.bonusTriggered,
        },
      });

      return {
        bankroll,
        bankrollBefore: fresh.currentBankroll,
        control,
        resolution,
        spinCount: fresh.spinCount + 1,
        payout,
      };
    },
    { timeout: 20_000 },
  );

  const nameById = new Map(session.participants.map((row) => [row.userId, row.user.displayName]));
  const actorName = nameById.get(userId) ?? "A player";
  await recordActivity({
    sessionId,
    userId,
    type: outcome.payout > 0 ? "WIN" : "BET",
    message:
      outcome.payout > 0
        ? `${actorName} spun ${bet} — won ${outcome.payout.toLocaleString()}`
        : `${actorName} spun ${bet}`,
    metadata: { roundId, payout: outcome.payout },
  });
  track({ name: "bet_placed", userId, sessionId, props: { bet, game: session.game.slug, mode: "shared" } });
  track({
    name: "game_result",
    userId,
    sessionId,
    props: { payout: outcome.payout, bet, bonusTriggered: outcome.resolution.bonusTriggered },
  });

  if (outcome.control.controllerId !== beforeController) {
    const nextName = nameById.get(outcome.control.controllerId ?? "") ?? null;
    await recordActivity({
      sessionId,
      userId: outcome.control.controllerId,
      type: "CONTROL_TRANSFERRED",
      message:
        outcome.control.reason === "auto-rotate"
          ? `Control rotated to ${nextName ?? "the table"}`
          : `Control moved to ${nextName ?? "the table"}`,
    });
    track({
      name: "controller_changed",
      userId: outcome.control.controllerId,
      sessionId,
      props: { reason: outcome.control.reason },
    });
  }

  // The round goes out BEFORE the session state: watchers queue the replay (and
  // hold the pot at bankrollBefore) before the new bankroll reaches them, so the
  // pot counter never jumps backwards on screen.
  const templeView = outcome.resolution.view as TempleOfZeusView | null;
  if (templeView && templeView.game === "temple-of-zeus") {
    getIo()?.to(room(sessionId)).emit("game:round", {
      roundId,
      sessionId,
      userId,
      bet,
      payout: outcome.payout,
      bankrollBefore: outcome.bankrollBefore,
      bankrollAfter: outcome.bankroll,
      bonusTriggered: outcome.resolution.bonusTriggered,
      reelStops: templeView.reels,
      winningLines: templeView.lastLines,
      teamMeter: templeView.teamMeter,
    });
  }

  const view = await broadcast(sessionId);

  getIo()?.to(room(sessionId)).emit("bankroll:updated", {
    currentBankroll: outcome.bankroll,
    initialBankroll: session.initialBankroll,
    delta: outcome.payout - bet,
  });
  if (outcome.control.controllerId !== beforeController) {
    getIo()?.to(room(sessionId)).emit("control:changed", {
      currentControllerId: outcome.control.controllerId,
      reason: outcome.control.reason,
    });
  }

  // Multiplayer bonus: defers to the group vote (or resolves inline for 1p).
  if (outcome.resolution.bonusTriggered && templeView?.pendingBonusChoice) {
    const pending = templeView.pendingBonusChoice;
    const activeCount = session.participants.filter((row) => !row.leftAt).length;
    if (activeCount > 1) {
      await createVoteLocked({
        sessionId,
        userId,
        type: "BONUS_OPTION",
        payload: { trigger: pending.trigger, options: pending.options },
        rule: "MAJORITY",
        internal: true,
      });
      await broadcast(sessionId);
    } else {
      const rng =
        session.rngMode === "seeded"
          ? createRng({ mode: "seeded", seed: `${session.rngSeed ?? "demo"}:${spinIndex}:bonus` })
          : createRng({ mode: "random" });
      const choice = rng.pick(pending.options).id as BonusPath;
      await resolveBonusLocked(sessionId, choice, userId);
      await broadcast(sessionId);
    }
  }

  const persistedAfter = readPersistedState(
    (await prisma.sharedSession.findUnique({ where: { id: sessionId }, select: { stateJson: true } }))
      ?.stateJson,
  );
  if (isDemoSession(persistedAfter.flags) && persistedAfter.flags.demoBotUserId) {
    onDemoSpin({
      sessionId,
      spinCount: outcome.spinCount,
      controllerId: outcome.control.controllerId,
      botUserId: persistedAfter.flags.demoBotUserId,
    });
  }

  return {
    ack: {
      roundId,
      payout: outcome.payout,
      bankroll: outcome.bankroll,
      bonusTriggered: outcome.resolution.bonusTriggered,
    },
    view,
  };
}

/* ====================================================================== */
/*  Game actions (bonus path etc.)                                         */
/* ====================================================================== */

export function performGameAction(input: {
  sessionId: string;
  userId: string;
  action: TempleAction;
}): Promise<SessionView> {
  return withSessionLock(input.sessionId, async () => {
    if (input.action.kind !== "choose-bonus-path") {
      throw new SessionError("INVALID_ACTION", "That game action isn't supported yet.");
    }

    const session = await prisma.sharedSession.findUnique({
      where: { id: input.sessionId },
      include: { participants: true },
    });
    if (!session) throw new SessionError("NOT_FOUND", "Session not found.");
    if (session.status !== "ACTIVE") {
      throw new SessionError("INVALID_PHASE", "The session isn't active.");
    }
    const open = await prisma.vote.findFirst({
      where: { sessionId: input.sessionId, status: "OPEN" },
      select: { id: true },
    });
    if (open) throw new SessionError("VOTE_IN_PROGRESS", "Finish the open vote first.");

    await resolveBonusLocked(input.sessionId, input.action.path, input.userId);
    return broadcast(input.sessionId);
  });
}

async function stepBackFromWagering(
  session: {
    id: string;
    currentControllerId: string | null;
    spinCount: number;
    controlRotationEvery: number;
    participants: { userId: string; leftAt: Date | null }[];
  },
  displayName: string,
  userId: string,
): Promise<void> {
  await prisma.sessionParticipant.update({
    where: { sessionId_userId: { sessionId: session.id, userId } },
    data: { leftAt: new Date() },
  });
  const candidates = session.participants.map((row) => ({
    userId: row.userId,
    active: !row.leftAt && row.userId !== userId,
  }));
  const next =
    session.currentControllerId === userId
      ? nextController(candidates, null)
      : session.currentControllerId;
  await prisma.sharedSession.update({
    where: { id: session.id },
    data: { currentControllerId: next },
  });
  await prisma.sessionParticipant.updateMany({
    where: { sessionId: session.id },
    data: { isController: false },
  });
  if (next) {
    await prisma.sessionParticipant.update({
      where: { sessionId_userId: { sessionId: session.id, userId: next } },
      data: { isController: true },
    });
  }
  await recordActivity({
    sessionId: session.id,
    userId,
    type: "LIMIT_REACHED",
    message: `${displayName} reached a play limit and stepped back from wagering`,
  });
  if (session.currentControllerId === userId) {
    getIo()?.to(room(session.id)).emit("control:changed", {
      currentControllerId: next,
      reason: "controller-left",
    });
    track({ name: "controller_changed", userId: next, sessionId: session.id, props: { reason: "rg-limit" } });
  }
  pushNotification({
    userId,
    id: randomUUID(),
    type: "rg_limit",
    title: "Play limit reached",
    body: "You've stepped back from wagering. You can still watch and chat.",
  });
}

/* ====================================================================== */
/*  Bonus resolution                                                       */
/* ====================================================================== */

async function resolveBonusLocked(
  sessionId: string,
  path: BonusPath,
  actorId: string | null,
): Promise<{ payout: number }> {
  const session = await prisma.sharedSession.findUnique({
    where: { id: sessionId },
    include: { game: true },
  });
  if (!session) throw new SessionError("NOT_FOUND", "Session not found.");
  const engine = getGameEngine(session.game.slug);
  if (!engine) throw new SessionError("UNKNOWN_GAME", "That game is not in the catalogue.");

  const persisted = readPersistedState(session.stateJson);
  const state = engine.hydrate(persisted.gameState);
  const currentView = engine.getState(state) as TempleOfZeusView | null;
  if (!currentView || currentView.game !== "temple-of-zeus" || !currentView.pendingBonusChoice) {
    throw new SessionError("NO_BONUS", "No bonus is waiting to be resolved.");
  }

  const ctx: GameContext = {
    rng: rngFor({
      rngMode: session.rngMode,
      rngSeed: session.rngSeed,
      spinCount: session.spinCount,
    }),
    roundId: randomUUID(),
    multiplayer: true,
  };
  const resolution = engine.performAction(state, { kind: "choose-bonus-path", path }, ctx);
  if (!resolution.accepted) {
    throw new SessionError("REJECTED", resolution.reason ?? "Bonus rejected.");
  }

  const payout = resolution.payout;
  // The round that triggered this bonus. Replays size the big-win banner off its
  // real bet instead of a hard-coded stake.
  const triggeringRound = await prisma.gameRound.findFirst({
    where: { sessionId, bonusTriggered: true },
    orderBy: { createdAt: "desc" },
    select: { id: true, bet: true },
  });
  const final = await prisma.$transaction(
    async (tx) => {
      const fresh = await tx.sharedSession.findUniqueOrThrow({ where: { id: sessionId } });
      const ledgerHost: LedgerHost = {
        id: fresh.id,
        ledgerSeq: fresh.ledgerSeq,
        lastLedgerHash: fresh.lastLedgerHash,
      };
      const after = fresh.currentBankroll + payout;
      if (payout > 0) {
        await appendLedger(tx, ledgerHost, {
          type: "BONUS",
          amount: payout,
          balanceBefore: fresh.currentBankroll,
          balanceAfter: after,
          actorId,
          metadata: { path, trigger: currentView.pendingBonusChoice?.trigger },
        });
      }
      await tx.sharedSession.update({
        where: { id: sessionId },
        data: {
          currentBankroll: after,
          stateJson: json(writePersistedState({ ...persisted, gameState: engine.serialize(resolution.state) })),
        },
      });
      if (payout > 0) {
        await tx.gameRound.create({
          data: {
            sessionId,
            userId: actorId,
            gameId: session.gameId,
            bet: 0,
            payout,
            result: json(resolution.view),
            bonusTriggered: false,
          },
        });
      }
      return { after, before: fresh.currentBankroll, initialBankroll: fresh.initialBankroll };
    },
    { timeout: 20_000 },
  );

  const label = path === "LIGHTNING" ? "Lightning Path" : "Shield Path";
  await recordActivity({
    sessionId,
    userId: actorId,
    type: "BONUS",
    message:
      payout > 0
        ? `${label} bonus paid ${payout.toLocaleString()} to the shared bankroll`
        : `${label} bonus completed`,
    metadata: { path, payout },
  });
  track({
    name: "game_result",
    userId: actorId,
    sessionId,
    props: { payout, bonus: path, kind: "team" },
  });
  // Sent before the caller's session state so every screen queues the free-spin
  // replay (and rewinds the pot) before the bonus winnings land.
  const bonusView = resolution.view as TempleOfZeusView | null;
  const bonusResult = bonusView?.lastBonusResult ?? null;
  if (bonusResult) {
    getIo()?.to(room(sessionId)).emit("game:bonus", {
      sessionId,
      roundId: triggeringRound?.id ?? bonusView?.roundId ?? null,
      userId: actorId,
      bet: bonusStake(triggeringRound?.bet, 10),
      bankrollBefore: final.before,
      bankrollAfter: final.after,
      result: bonusResult,
    });
  }
  getIo()?.to(room(sessionId)).emit("bankroll:updated", {
    currentBankroll: final.after,
    initialBankroll: final.initialBankroll,
    delta: payout,
  });

  return { payout };
}

/* ====================================================================== */
/*  Control                                                                */
/* ====================================================================== */

export function requestControl(input: {
  sessionId: string;
  userId: string;
}): Promise<SessionView> {
  return withSessionLock(input.sessionId, async () => {
    const session = await prisma.sharedSession.findUnique({
      where: { id: input.sessionId },
      include: { participants: { include: { user: { select: { displayName: true } } } } },
    });
    if (!session) throw new SessionError("NOT_FOUND", "Session not found.");
    if (session.status !== "ACTIVE") {
      throw new SessionError("INVALID_PHASE", "The session hasn't started yet.");
    }
    const participant = session.participants.find((row) => row.userId === input.userId);
    if (!participant || participant.leftAt) {
      throw new SessionError("NOT_PARTICIPANT", "You're not an active participant.");
    }
    if (session.currentControllerId === input.userId) {
      throw new SessionError("ALREADY_CONTROLLER", "You already have control.");
    }

    const persisted = readPersistedState(session.stateJson);
    const requestedAt = new Date().toISOString();
    const requests = toControlStates(
      upsertControlRequest(toPendingRequests(persisted.controlRequests), {
        byUserId: input.userId,
        byName: participant.user.displayName,
        requestedAt: new Date(requestedAt),
      }),
    );
    await prisma.sharedSession.update({
      where: { id: input.sessionId },
      data: { stateJson: json(writePersistedState({ ...persisted, controlRequests: requests })) },
    });
    await recordActivity({
      sessionId: input.sessionId,
      userId: input.userId,
      type: "CONTROL_REQUESTED",
      message: `${participant.user.displayName} wants control`,
    });
    track({ name: "control_requested", userId: input.userId, sessionId: input.sessionId });

    getIo()?.to(room(input.sessionId)).emit("control:requested", {
      byUserId: input.userId,
      byName: participant.user.displayName,
      requestedAt,
    });
    if (session.currentControllerId && session.currentControllerId !== input.userId) {
      pushNotification({
        userId: session.currentControllerId,
        id: randomUUID(),
        type: "control_request",
        title: `${participant.user.displayName} wants control`,
        body: "Pass control or keep spinning.",
      });
    }
    return broadcast(input.sessionId);
  });
}

export function passControl(input: {
  sessionId: string;
  userId: string;
  toUserId?: string;
}): Promise<SessionView> {
  return withSessionLock(input.sessionId, async () => {
    const session = await prisma.sharedSession.findUnique({
      where: { id: input.sessionId },
      include: { participants: { include: { user: { select: { displayName: true } } } } },
    });
    if (!session) throw new SessionError("NOT_FOUND", "Session not found.");
    if (session.status !== "ACTIVE") {
      throw new SessionError("INVALID_PHASE", "The session hasn't started yet.");
    }
    if (session.currentControllerId !== input.userId) {
      throw new SessionError("NOT_CONTROLLER", "Only the controller can pass control.");
    }

    const active = session.participants.filter((row) => !row.leftAt);
    const persisted = readPersistedState(session.stateJson);
    const pendingRequest = persisted.controlRequests.find(
      (row) => row.byUserId !== input.userId && active.some((p) => p.userId === row.byUserId),
    );
    const target =
      input.toUserId ??
      pendingRequest?.byUserId ??
      active.find((row) => row.userId !== input.userId)?.userId;
    if (!target) {
      throw new SessionError("NO_TARGET", "There's nobody else to pass control to.");
    }
    const targetRow = active.find((row) => row.userId === target);
    if (!targetRow) throw new SessionError("NOT_PARTICIPANT", "That player has left the table.");

    const fromName =
      session.participants.find((row) => row.userId === input.userId)?.user.displayName ?? "Host";

    await setControllerLocked(session, target, {
      reason: "manual-pass",
      byName: fromName,
      clearRequestFor: target,
      activityMessage: `${fromName} passed control to ${targetRow.user.displayName}`,
      requesterId: input.userId,
    });

    return broadcast(input.sessionId);
  });
}

async function setControllerLocked(
  session: {
    id: string;
    participants: { userId: string }[];
  },
  toUserId: string,
  options: {
    reason: string;
    byName?: string;
    clearRequestFor?: string;
    activityMessage: string;
    requesterId?: string | null;
  },
): Promise<void> {
  const current = await prisma.sharedSession.findUniqueOrThrow({
    where: { id: session.id },
    select: { stateJson: true },
  });
  const persisted = readPersistedState(current.stateJson);
  const controlRequests = options.clearRequestFor
    ? toControlStates(
        clearControlRequest(toPendingRequests(persisted.controlRequests), options.clearRequestFor),
      )
    : persisted.controlRequests;

  await prisma.$transaction(async (tx) => {
    await tx.sharedSession.update({
      where: { id: session.id },
      data: {
        currentControllerId: toUserId,
        stateJson: json(writePersistedState({ ...persisted, controlRequests })),
      },
    });
    await tx.sessionParticipant.updateMany({
      where: { sessionId: session.id },
      data: { isController: false },
    });
    await tx.sessionParticipant.update({
      where: { sessionId_userId: { sessionId: session.id, userId: toUserId } },
      data: { isController: true },
    });
  });

  await recordActivity({
    sessionId: session.id,
    userId: toUserId,
    type: "CONTROL_TRANSFERRED",
    message: options.activityMessage,
  });
  track({
    name: "controller_changed",
    userId: toUserId,
    sessionId: session.id,
    props: { reason: options.reason },
  });
  getIo()?.to(room(session.id)).emit("control:changed", {
    currentControllerId: toUserId,
    reason: options.reason,
    byName: options.byName,
  });

  const flags = readPersistedState(current.stateJson).flags;
  if (isDemoSession(flags) && flags.demoBotUserId) {
    onDemoControlChanged({
      sessionId: session.id,
      currentControllerId: toUserId,
      botUserId: flags.demoBotUserId,
    });
  }
}

/* ====================================================================== */
/*  Voting                                                                 */
/* ====================================================================== */

export function createSessionVote(input: {
  sessionId: string;
  userId: string;
  type: VoteType;
  payload?: Record<string, unknown>;
  rule?: VoteRule;
}): Promise<{ view: SessionView; vote: VoteView }> {
  return withSessionLock(input.sessionId, async () => {
    const voteId = await createVoteLocked(input);
    const view = await broadcast(input.sessionId);
    const vote = await loadVoteView(voteId);
    return { view, vote };
  });
}

async function loadVoteView(voteId: string): Promise<VoteView> {
  const row = await prisma.vote.findUnique({
    where: { id: voteId },
    include: {
      responses: { include: { user: { select: { displayName: true } } } },
      createdBy: { select: { displayName: true } },
      session: { include: { participants: true } },
    },
  });
  if (!row) throw new SessionError("NOT_FOUND", "Vote not found.");
  const eligible = row.session.participants.filter((p) => !p.leftAt).map((p) => p.userId);
  return buildVoteView(row, eligible);
}

async function createVoteLocked(input: {
  sessionId: string;
  userId: string;
  type: VoteType;
  payload?: Record<string, unknown>;
  rule?: VoteRule;
  internal?: boolean;
}): Promise<string> {
  const session = await prisma.sharedSession.findUnique({
    where: { id: input.sessionId },
    include: { participants: true },
  });
  if (!session) throw new SessionError("NOT_FOUND", "Session not found.");
  if (session.status !== "ACTIVE") {
    throw new SessionError("INVALID_PHASE", "The session hasn't started yet.");
  }
  const participant = session.participants.find((row) => row.userId === input.userId);
  if (!participant || (participant.leftAt && !input.internal)) {
    throw new SessionError("NOT_PARTICIPANT", "You're not an active participant.");
  }
  const open = await prisma.vote.findFirst({
    where: { sessionId: input.sessionId, status: "OPEN" },
    select: { id: true },
  });
  if (open) throw new SessionError("VOTE_IN_PROGRESS", "Another vote is already open.");

  if (input.type === "BONUS_OPTION" && !input.internal) {
    throw new SessionError("FORBIDDEN", "Bonus votes are created by the game.");
  }
  if (input.type === "LARGE_BET") {
    if (session.currentControllerId !== input.userId) {
      throw new SessionError("NOT_CONTROLLER", "Only the controller can propose a large bet.");
    }
    const bet = Number(input.payload?.bet);
    if (!Number.isInteger(bet) || !isLargeBet(bet, session.currentBankroll)) {
      throw new SessionError("NOT_LARGE", "That isn't a large bet — just spin it.");
    }
  }
  if (input.type === "PASS_CONTROL") {
    const target = String(input.payload?.toUserId ?? "");
    const targetRow = session.participants.find(
      (row) => row.userId === target && !row.leftAt,
    );
    if (!targetRow) throw new SessionError("NO_TARGET", "Choose an active player to pass to.");
  }

  const rule = input.rule ?? defaultRuleFor(input.type);
  const vote = await prisma.vote.create({
    data: {
      sessionId: input.sessionId,
      type: input.type,
      status: "OPEN",
      rule,
      payload: input.payload ? json(input.payload) : undefined,
      createdById: input.userId,
    },
  });

  const actorName =
    (
      await prisma.user.findUnique({
        where: { id: input.userId },
        select: { displayName: true },
      })
    )?.displayName ?? "A player";

  await recordActivity({
    sessionId: input.sessionId,
    userId: input.userId,
    type: "VOTE_STARTED",
    message: `${actorName} started a vote — ${VOTE_LABELS[input.type] ?? input.type}`,
  });
  track({ name: "vote_started", userId: input.userId, sessionId: input.sessionId, props: { type: input.type } });

  const eligible = session.participants.filter((row) => !row.leftAt).map((row) => row.userId);
  const withRelations = {
    ...vote,
    createdBy: { displayName: actorName },
    responses: [] as { userId: string; choice: string; createdAt: Date; user: { displayName: string } }[],
  };
  const view = buildVoteView(withRelations, eligible);
  getIo()?.to(room(input.sessionId)).emit("vote:started", view);

  const flags = readPersistedState(
    (await prisma.sharedSession.findUnique({ where: { id: input.sessionId }, select: { stateJson: true } }))
      ?.stateJson,
  ).flags;
  if (isDemoSession(flags) && flags.demoBotUserId) {
    onDemoVoteCreated({
      sessionId: input.sessionId,
      voteId: vote.id,
      type: input.type,
      payload: (vote.payload as Record<string, unknown> | null) ?? null,
      botUserId: flags.demoBotUserId,
    });
  }

  return vote.id;
}

export function castVote(input: {
  sessionId: string;
  userId: string;
  voteId: string;
  choice: string;
}): Promise<{ view: SessionView; vote: VoteView }> {
  return withSessionLock(input.sessionId, async () => {
    const voteId = await castVoteLocked(input);
    const view = await broadcast(input.sessionId);
    const vote = await loadVoteView(voteId);
    return { view, vote };
  });
}

async function castVoteLocked(input: {
  sessionId: string;
  userId: string;
  voteId: string;
  choice: string;
}): Promise<string> {
  const vote = await prisma.vote.findUnique({
    where: { id: input.voteId },
    include: {
      responses: { include: { user: { select: { displayName: true } } } },
      createdBy: { select: { displayName: true } },
    },
  });
  if (!vote || vote.sessionId !== input.sessionId) {
    throw new SessionError("NOT_FOUND", "Vote not found.");
  }
  if (vote.status !== "OPEN") {
    throw new SessionError("VOTE_CLOSED", "That vote has already closed.");
  }
  const session = await prisma.sharedSession.findUnique({
    where: { id: input.sessionId },
    include: { participants: true },
  });
  if (!session) throw new SessionError("NOT_FOUND", "Session not found.");

  const eligible = session.participants.filter((row) => !row.leftAt).map((row) => row.userId);
  if (!eligible.includes(input.userId)) {
    throw new SessionError("NOT_PARTICIPANT", "You can't vote in this session.");
  }

  const payload = (vote.payload ?? {}) as Record<string, unknown>;
  if (vote.type === "BONUS_OPTION") {
    const options = Array.isArray(payload.options) ? (payload.options as { id: string }[]) : [];
    if (!options.some((option) => option.id === input.choice)) {
      throw new SessionError("INVALID_CHOICE", "Pick one of the bonus paths.");
    }
  } else if (input.choice !== "YES" && input.choice !== "NO") {
    throw new SessionError("INVALID_CHOICE", "Votes are Yes or No.");
  }

  await prisma.voteResponse.upsert({
    where: { voteId_userId: { voteId: vote.id, userId: input.userId } },
    update: { choice: input.choice, createdAt: new Date() },
    create: { voteId: vote.id, userId: input.userId, choice: input.choice },
  });
  track({ name: "vote_cast", userId: input.userId, sessionId: input.sessionId, props: { type: vote.type, choice: input.choice } });

  const refreshed = await prisma.vote.findUniqueOrThrow({
    where: { id: vote.id },
    include: {
      responses: { include: { user: { select: { displayName: true } } } },
      createdBy: { select: { displayName: true } },
    },
  });
  const view = buildVoteView(refreshed, eligible);

  if (view.status === "OPEN") {
    getIo()?.to(room(input.sessionId)).emit("vote:updated", view);
    return vote.id;
  }

  await prisma.vote.update({
    where: { id: vote.id },
    data: { status: view.status, resolvedAt: new Date() },
  });
  const completed = { ...view, resolvedAt: new Date().toISOString() };
  getIo()?.to(room(input.sessionId)).emit("vote:completed", completed);
  track({
    name: "vote_completed",
    userId: input.userId,
    sessionId: input.sessionId,
    props: { type: vote.type, status: view.status },
  });

  if (view.status === "PASSED") {
    if (vote.type === "CASH_OUT") {
      await settleLocked(input.sessionId, input.userId, "cash-out vote passed");
      return vote.id;
    }
    if (vote.type === "LARGE_BET") {
      const current = await prisma.sharedSession.findUniqueOrThrow({
        where: { id: input.sessionId },
        select: { stateJson: true },
      });
      const persisted = readPersistedState(current.stateJson);
      await prisma.sharedSession.update({
        where: { id: input.sessionId },
        data: {
          stateJson: json(
            writePersistedState({
              ...persisted,
              largeBetApproval: { bet: Number(payload.bet), voteId: vote.id },
            }),
          ),
        },
      });
      await recordActivity({
        sessionId: input.sessionId,
        userId: input.userId,
        type: "VOTE_PASSED",
        message: `Large bet of ${Number(payload.bet).toLocaleString()} approved`,
      });
    }
    if (vote.type === "PASS_CONTROL") {
      const target = String(payload.toUserId);
      const sessionWithNames = await prisma.sharedSession.findUniqueOrThrow({
        where: { id: input.sessionId },
        include: { participants: { include: { user: { select: { displayName: true } } } } },
      });
      const targetName = sessionWithNames.participants.find(
        (row) => row.userId === target,
      )?.user.displayName;
      await setControllerLocked(sessionWithNames, target, {
        reason: "vote-passed",
        activityMessage: `Vote passed — control moved to ${targetName ?? "the group's pick"}`,
      });
    }
    if (vote.type === "BONUS_OPTION") {
      const options = Array.isArray(payload.options)
        ? (payload.options as { id: string }[]).map((option) => option.id)
        : undefined;
      const outcome = tallyVote({
        type: vote.type,
        rule: (vote.rule || defaultRuleFor(vote.type)) as VoteRule,
        eligibleUserIds: eligible,
        responses: refreshed.responses.map((response) => ({
          userId: response.userId,
          choice: response.choice,
          createdAt: response.createdAt,
        })),
        optionOrder: options,
      });
      const winner = (outcome.winner ?? outcome.leader ?? "LIGHTNING") as BonusPath;
      // The bonus changes the pot; the caller's broadcast pushes the new state.
      await resolveBonusLocked(input.sessionId, winner, vote.createdById);
    }
  } else {
    await recordActivity({
      sessionId: input.sessionId,
      userId: input.userId,
      type: "VOTE_FAILED",
      message: `${VOTE_LABELS[vote.type] ?? vote.type} — vote ${view.status.toLowerCase()}`,
    });
  }

  return vote.id;
}

/* ====================================================================== */
/*  Chat & reactions                                                       */
/* ====================================================================== */

export function sendChat(input: {
  sessionId: string;
  userId: string;
  body: string;
}): Promise<ChatMessageView> {
  return withSessionLock(input.sessionId, async () => {
    const body = input.body.trim();
    if (!body) throw new SessionError("EMPTY", "Say something first.");
    if (body.length > 500) throw new SessionError("TOO_LONG", "Keep it under 500 characters.");

    const participant = await prisma.sessionParticipant.findUnique({
      where: { sessionId_userId: { sessionId: input.sessionId, userId: input.userId } },
      include: { user: { select: { displayName: true, avatar: true } } },
    });
    if (!participant) throw new SessionError("NOT_PARTICIPANT", "You're not in this session.");

    const message = await prisma.chatMessage.create({
      data: { sessionId: input.sessionId, userId: input.userId, body },
    });
    track({ name: "chat_message_sent", userId: input.userId, sessionId: input.sessionId });

    const view: ChatMessageView = {
      id: message.id,
      sessionId: input.sessionId,
      userId: input.userId,
      displayName: participant.user.displayName,
      avatar: participant.user.avatar,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
    };
    getIo()?.to(room(input.sessionId)).emit("chat:message", view);
    return view;
  });
}

export function sendReaction(input: {
  sessionId: string;
  userId: string;
  emoji: string;
}): Promise<void> {
  return withSessionLock(input.sessionId, async () => {
    if (!isReactionEmoji(input.emoji)) {
      throw new SessionError("INVALID_EMOJI", "Unsupported reaction.");
    }
    const participant = await prisma.sessionParticipant.findUnique({
      where: { sessionId_userId: { sessionId: input.sessionId, userId: input.userId } },
      include: { user: { select: { displayName: true } } },
    });
    if (!participant) throw new SessionError("NOT_PARTICIPANT", "You're not in this session.");

    const reaction = await prisma.reaction.create({
      data: { sessionId: input.sessionId, userId: input.userId, emoji: input.emoji },
    });
    track({ name: "reaction_sent", userId: input.userId, sessionId: input.sessionId, props: { emoji: input.emoji } });

    getIo()?.to(room(input.sessionId)).emit("reaction", {
      id: reaction.id,
      sessionId: input.sessionId,
      userId: input.userId,
      displayName: participant.user.displayName,
      emoji: input.emoji,
      createdAt: reaction.createdAt.toISOString(),
    });
  });
}

/* ====================================================================== */
/*  Settlement                                                             */
/* ====================================================================== */

export function closeSharedSession(input: {
  sessionId: string;
  userId: string;
}): Promise<SettlementResult> {
  return withSessionLock(input.sessionId, async () => {
    const session = await prisma.sharedSession.findUnique({
      where: { id: input.sessionId },
      include: { participants: true },
    });
    if (!session) throw new SessionError("NOT_FOUND", "Session not found.");
    if (session.hostId !== input.userId) {
      throw new SessionError(
        "HOST_ONLY",
        "Only the host can end the session directly — or start a cash-out vote.",
      );
    }
    return settleLocked(input.sessionId, input.userId, "host");
  });
}

async function settleLocked(
  sessionId: string,
  byUserId: string | null,
  reason: string,
): Promise<SettlementResult> {
  const session = await prisma.sharedSession.findUnique({
    where: { id: sessionId },
    include: {
      participants: { include: { user: { select: { id: true, displayName: true } } } },
    },
  });
  if (!session) throw new SessionError("NOT_FOUND", "Session not found.");
  if (session.status === "CLOSED") {
    throw new SessionError("ALREADY_CLOSED", "This session has already been settled.");
  }

  const activeStatus = session.status;
  if (activeStatus !== "ACTIVE" && activeStatus !== "LOBBY" && activeStatus !== "CLOSING") {
    throw new SessionError("INVALID_PHASE", "This session can't be settled right now.");
  }

  const contributions = session.participants.map((row) => ({
    userId: row.userId,
    amount: row.contribution,
  }));
  const shares = settleShares(session.currentBankroll, contributions);
  const closedAt = new Date();
  const finalBankroll = session.currentBankroll;

  await prisma.$transaction(
    async (tx) => {
      for (const share of shares) {
        await tx.sessionParticipant.update({
          where: { sessionId_userId: { sessionId, userId: share.userId } },
          data: { finalSettlement: share.share },
        });
        if (share.share > 0) {
          await tx.user.update({
            where: { id: share.userId },
            data: { demoBalance: { increment: share.share } },
          });
        }
      }
      const fresh = await tx.sharedSession.findUniqueOrThrow({ where: { id: sessionId } });
      const ledgerHost: LedgerHost = {
        id: fresh.id,
        ledgerSeq: fresh.ledgerSeq,
        lastLedgerHash: fresh.lastLedgerHash,
      };
      await appendLedger(tx, ledgerHost, {
        type: "SETTLEMENT",
        amount: finalBankroll,
        balanceBefore: finalBankroll,
        balanceAfter: 0,
        actorId: byUserId,
        metadata: {
          reason,
          shares: shares.map((share) => ({
            userId: share.userId,
            share: share.share,
            ownershipBp: share.ownershipBp,
          })),
        },
      });
      const persisted = readPersistedState(fresh.stateJson);
      await tx.sharedSession.update({
        where: { id: sessionId },
        data: {
          status: "CLOSED",
          closedAt,
          stateJson: json(
            writePersistedState({ ...persisted, controlRequests: [], largeBetApproval: null }),
          ),
        },
      });
      await tx.vote.updateMany({
        where: { sessionId, status: "OPEN" },
        data: { status: "CANCELLED", resolvedAt: closedAt },
      });
    },
    { timeout: 20_000 },
  );

  const settlement: SettlementResult = {
    sessionId,
    initialBankroll: session.initialBankroll,
    finalBankroll,
    profit: finalBankroll - session.initialBankroll,
    shares: shares.map((share) => ({
      userId: share.userId,
      displayName:
        session.participants.find((row) => row.userId === share.userId)?.user.displayName ??
        "Player",
      contribution: share.contribution,
      ownershipBp: share.ownershipBp,
      share: share.share,
      profit: share.profit,
    })),
    closedAt: closedAt.toISOString(),
  };

  await recordActivity({
    sessionId,
    userId: byUserId,
    type: "SESSION_CLOSED",
    message:
      reason === "host"
        ? "Session settled — everyone got their share"
        : "Cash-out vote passed — session settled",
  });
  track({
    name: "shared_session_closed",
    userId: byUserId,
    sessionId,
    props: {
      profit: settlement.profit,
      finalBankroll,
      participants: shares.length,
      reason,
    },
  });

  for (const share of settlement.shares) {
    const body = `${formatSignedCredits(share.profit)} demo credits ${
      share.profit >= 0 ? "won" : "lost"
    } · settlement ${share.share.toLocaleString()}`;
    notify({
      userId: share.userId,
      type: "settlement",
      title: "Session settled",
      body,
      data: { sessionId, share: share.share, profit: share.profit },
    });
    pushNotification({
      userId: share.userId,
      id: randomUUID(),
      type: "settlement",
      title: `Session settled: ${formatSignedCredits(share.profit)} demo credits`,
      body: `Your share of the bankroll: ${share.share.toLocaleString()}`,
      createdAt: closedAt,
    });
  }

  getIo()?.to(room(sessionId)).emit("session:settled", settlement);
  getIo()?.to(room(sessionId)).emit("session:closed", { sessionId });
  await broadcast(sessionId);
  return settlement;
}

/* ====================================================================== */
/*  Leave                                                                  */
/* ====================================================================== */

export function leaveSharedSession(input: {
  sessionId: string;
  userId: string;
}): Promise<SessionView | null> {
  return withSessionLock(input.sessionId, async () => {
    const session = await prisma.sharedSession.findUnique({
      where: { id: input.sessionId },
      include: {
        participants: { include: { user: { select: { displayName: true } } } },
        game: true,
      },
    });
    if (!session) throw new SessionError("NOT_FOUND", "Session not found.");
    const participant = session.participants.find((row) => row.userId === input.userId);
    if (!participant) throw new SessionError("NOT_PARTICIPANT", "You're not in this session.");

    if (session.status === "CLOSED") {
      return broadcast(input.sessionId);
    }

    if (session.status === "LOBBY") {
      if (session.hostId === input.userId) {
        // Host abandoning the lobby cancels the session (everyone refunded).
        await settleLocked(input.sessionId, input.userId, "host cancelled the lobby");
        return null;
      }
      const amount = participant.contribution;
      await prisma.$transaction(async (tx) => {
        const fresh = await tx.sharedSession.findUniqueOrThrow({
          where: { id: input.sessionId },
          include: { participants: true },
        });
        await tx.sessionParticipant.delete({
          where: { id: participant.id },
        });
        const remaining = fresh.participants.filter((row) => row.userId !== input.userId);
        if (remaining.length > 0) {
          const ownership = calculateOwnership(
            remaining.map((row) => ({ userId: row.userId, amount: row.contribution })),
          );
          for (const row of remaining) {
            await tx.sessionParticipant.update({
              where: { id: row.id },
              data: {
                ownershipBp: ownership.find((entry) => entry.userId === row.userId)!.ownershipBp,
              },
            });
          }
        }
        const ledgerHost: LedgerHost = {
          id: fresh.id,
          ledgerSeq: fresh.ledgerSeq,
          lastLedgerHash: fresh.lastLedgerHash,
        };
        await appendLedger(tx, ledgerHost, {
          type: "ADJUSTMENT",
          amount: -amount,
          balanceBefore: fresh.currentBankroll,
          balanceAfter: fresh.currentBankroll - amount,
          actorId: input.userId,
          metadata: { note: "contribution withdrawn" },
        });
        await tx.sharedSession.update({
          where: { id: input.sessionId },
          data: {
            initialBankroll: { decrement: amount },
            currentBankroll: { decrement: amount },
          },
        });
        await tx.user.update({
          where: { id: input.userId },
          data: { demoBalance: { increment: amount } },
        });
      });
      await recordActivity({
        sessionId: input.sessionId,
        userId: input.userId,
        type: "USER_LEFT",
        message: `${participant.user.displayName} withdrew their contribution`,
      });
      return broadcast(input.sessionId);
    }

    // ACTIVE — step away, keeping ownership for the final settlement.
    await prisma.sessionParticipant.update({
      where: { id: participant.id },
      data: { leftAt: new Date(), isController: false },
    });

    const wasController = session.currentControllerId === input.userId;
    if (wasController) {
      const control = resolveControlAfterSpin({
        orderedCandidates: session.participants.map((row) => ({
          userId: row.userId,
          active: row.userId === input.userId ? false : !row.leftAt,
        })),
        currentControllerId: input.userId,
        spinCount: session.spinCount,
        rotationEvery: session.controlRotationEvery,
      });
      await prisma.sharedSession.update({
        where: { id: input.sessionId },
        data: { currentControllerId: control.controllerId },
      });
      if (control.controllerId) {
        await prisma.sessionParticipant.update({
          where: {
            sessionId_userId: {
              sessionId: input.sessionId,
              userId: control.controllerId,
            },
          },
          data: { isController: true },
        });
      }
      getIo()?.to(room(input.sessionId)).emit("control:changed", {
        currentControllerId: control.controllerId,
        reason: "controller-left",
      });
      track({
        name: "controller_changed",
        userId: control.controllerId,
        sessionId: input.sessionId,
        props: { reason: "controller-left" },
      });
    }

    await recordActivity({
      sessionId: input.sessionId,
      userId: input.userId,
      type: "USER_LEFT",
      message: `${participant.user.displayName} left the table`,
    });

    // Their departure may complete an open vote.
    await recheckOpenVotes(input.sessionId);

    return broadcast(input.sessionId);
  });
}

async function recheckOpenVotes(sessionId: string): Promise<void> {
  const open = await prisma.vote.findFirst({
    where: { sessionId, status: "OPEN" },
    include: {
      responses: { include: { user: { select: { displayName: true } } } },
      createdBy: { select: { displayName: true } },
    },
  });
  if (!open) return;
  const session = await prisma.sharedSession.findUnique({
    where: { id: sessionId },
    include: { participants: true },
  });
  if (!session) return;
  const eligible = session.participants.filter((row) => !row.leftAt).map((row) => row.userId);
  const view = buildVoteView(open, eligible);
  if (view.status === "OPEN") {
    getIo()?.to(room(sessionId)).emit("vote:updated", view);
    return;
  }
  await prisma.vote.update({
    where: { id: open.id },
    data: { status: view.status, resolvedAt: new Date() },
  });
  getIo()?.to(room(sessionId)).emit("vote:completed", { ...view, resolvedAt: new Date().toISOString() });
  if (view.status === "PASSED" && open.type === "CASH_OUT") {
    await settleLocked(sessionId, null, "cash-out vote passed");
  }
}

/* ====================================================================== */
/*  Investor-demo: forced ZEUS POWER (scripted only)                       */
/* ====================================================================== */

export function forceTeamBonus(input: { sessionId: string }): Promise<void> {
  return withSessionLock(input.sessionId, async () => {
    const session = await prisma.sharedSession.findUnique({
      where: { id: input.sessionId },
      include: { game: true, participants: true },
    });
    if (!session) throw new SessionError("NOT_FOUND", "Session not found.");
    if (session.status !== "ACTIVE") {
      throw new SessionError("INVALID_PHASE", "The session isn't active.");
    }
    const flags = readPersistedState(session.stateJson).flags;
    if (!flags.demoBot) {
      // Hard guard: forced outcomes exist only in the labelled demo script.
      throw new SessionError("FORBIDDEN", "Scripted bonuses are investor-demo only.");
    }
    const open = await prisma.vote.findFirst({
      where: { sessionId: input.sessionId, status: "OPEN" },
      select: { id: true },
    });
    if (open) throw new SessionError("VOTE_IN_PROGRESS", "A vote is already open.");

    const engine = getGameEngine(session.game.slug);
    if (!engine) throw new SessionError("UNKNOWN_GAME", "That game is not in the catalogue.");
    const persisted = readPersistedState(session.stateJson);
    const state = engine.hydrate(persisted.gameState);
    const view = engine.getState(state) as TempleOfZeusView | null;
    if (!view || view.game !== "temple-of-zeus") {
      throw new SessionError("WRONG_GAME", "Team bonus script runs on Temple of Zeus.");
    }
    if (view.pendingBonusChoice) {
      throw new SessionError("VOTE_IN_PROGRESS", "A bonus is already pending.");
    }

    const options = demoBonusOptions();
    const mutable = state as { pendingBonusChoice?: unknown; teamMeter?: number };
    mutable.pendingBonusChoice = { trigger: "team", options };
    mutable.teamMeter = view.teamMeterTarget;

    await prisma.sharedSession.update({
      where: { id: input.sessionId },
      data: {
        stateJson: json(
          writePersistedState({ ...persisted, gameState: engine.serialize(state) }),
        ),
      },
    });
    await recordActivity({
      sessionId: input.sessionId,
      userId: session.currentControllerId,
      type: "TEAM_BONUS",
      message: "ZEUS POWER meter filled — the team bonus is ready!",
    });
    await createVoteLocked({
      sessionId: input.sessionId,
      userId: session.currentControllerId ?? session.hostId,
      type: "BONUS_OPTION",
      payload: { trigger: "team", options },
      rule: "MAJORITY",
      internal: true,
    });
    await broadcast(input.sessionId);
  });
}

/* ====================================================================== */
/*  Demo driver wiring                                                     */
/* ====================================================================== */

registerBotDrivers({
  join: (params) => joinSharedSession(params),
  spin: async (params) => {
    await spinShared(params);
  },
  requestControl: (params) => requestControl(params),
  passControl: (params) => passControl(params),
  castVote: async (params) => {
    await castVote(params);
  },
  sendChat: async (params) => {
    await sendChat(params);
  },
  sendReaction: async (params) => {
    await sendReaction(params);
  },
  // eslint-disable-next-line @typescript-eslint/await-thenable -- driver contract is Promise-returning
  forceTeamBonus: async (params) => {
    await forceTeamBonus(params);
  },
  getOpenVote: async (sessionId) => {
    const vote = await prisma.vote.findFirst({
      where: { sessionId, status: "OPEN" },
      include: { responses: true },
      orderBy: { createdAt: "desc" },
    });
    if (!vote) return null;
    return {
      id: vote.id,
      type: vote.type,
      payload: (vote.payload as Record<string, unknown> | null) ?? null,
      responses: vote.responses.map((row) => ({ userId: row.userId, choice: row.choice })),
    };
  },
});

export { tallyVote };
