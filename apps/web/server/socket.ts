import type { Server, Socket } from "socket.io";
import { z } from "zod";
import { prisma } from "@sharedplay/db";
import type {
  AckFn,
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "@sharedplay/types";
import { SESSION_COOKIE, parseCookieHeader, verifySession } from "../src/lib/session";
import { setIo } from "./realtime/bus";
import { errorMessage } from "./realtime/errors";
import { presence } from "./realtime/presence";
import {
  castVote,
  closeSharedSession,
  createSessionVote,
  joinSharedSession,
  leaveSharedSession,
  passControl,
  performGameAction,
  requestControl,
  sendChat,
  sendReaction,
  spinShared,
  startSharedSession,
} from "./realtime/service";
import { buildSessionView } from "./realtime/view";

type AppServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

const sessionIdSchema = z.string().min(1).max(64);
const amountSchema = z.number().int().positive().max(1_000_000);
const betSchema = z.number().int().positive().max(1_000_000);
const bodySchema = z.string().min(1).max(500);
const voteTypeSchema = z.enum(["CASH_OUT", "LARGE_BET", "BONUS_OPTION", "PASS_CONTROL"]);
const voteRuleSchema = z.enum(["MAJORITY", "UNANIMOUS"]).optional();
const emojiSchema = z.enum(["🔥", "😂", "⚡", "😱", "👏"]);
const bonusPathSchema = z.enum(["LIGHTNING", "SHIELD"]);

async function withAck<T>(ack: AckFn<T>, task: () => Promise<T | void>): Promise<void> {
  try {
    const data = await task();
    ack({ ok: true, data: data as T });
  } catch (error) {
    ack({ ok: false, error: errorMessage(error) });
  }
}

function requireAuth(socket: AppSocket): SocketData {
  if (!socket.data.userId) {
    throw new Error("Not signed in.");
  }
  return socket.data;
}

export function attachRealtime(io: AppServer): void {
  setIo(io);

  io.use(async (socket, next) => {
    try {
      const cookies = parseCookieHeader(socket.handshake.headers.cookie);
      const payload = verifySession(cookies[SESSION_COOKIE]);
      if (!payload) {
        next(new Error("Not signed in."));
        return;
      }
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, username: true, displayName: true },
      });
      if (!user) {
        next(new Error("Account not found."));
        return;
      }
      socket.data.userId = user.id;
      socket.data.username = user.username;
      socket.data.displayName = user.displayName;
      next();
    } catch (error) {
      next(error instanceof Error ? error : new Error("Authentication failed."));
    }
  });

  io.on("connection", (socket) => {
    const auth = requireAuth(socket);
    const { userId } = auth;

    presence.connect(userId, socket.id);
    socket.join(`user:${userId}`);

    const unsubscribePresence = presence.onChange((payload) => {
      socket.emit("presence", payload);
    });

    socket.on("session:join", (payload, ack) => {
      void withAck(ack, async () => {
        const parsed = sessionIdSchema.safeParse(payload?.sessionId);
        if (!parsed.success) throw new Error("Invalid session.");
        const sessionId = parsed.data;
        socket.join(`session:${sessionId}`);
        presence.joinSession(sessionId, userId, socket.id);
        const view = await buildSessionView(sessionId);
        socket
          .to(`session:${sessionId}`)
          .emit("presence", { userId, online: true });
        return view;
      });
    });

    socket.on("session:contribute", (payload, ack) => {
      void withAck(ack, async () => {
        const sessionId = sessionIdSchema.parse(payload?.sessionId);
        const amount = amountSchema.parse(payload?.amount);
        const view = await joinSharedSession({ sessionId, userId, amount });
        socket.join(`session:${sessionId}`);
        presence.joinSession(sessionId, userId, socket.id);
        return view;
      });
    });

    socket.on("session:start", (payload, ack) => {
      void withAck(ack, async () => {
        const sessionId = sessionIdSchema.parse(payload?.sessionId);
        return startSharedSession({ sessionId, userId });
      });
    });

    socket.on("session:leave", (payload, ack) => {
      void withAck(ack, async () => {
        const sessionId = sessionIdSchema.parse(payload?.sessionId);
        await leaveSharedSession({ sessionId, userId });
        socket.leave(`session:${sessionId}`);
        presence.leaveSession(sessionId, userId, socket.id);
      });
    });

    socket.on("session:close", (payload, ack) => {
      void withAck(ack, async () => {
        const sessionId = sessionIdSchema.parse(payload?.sessionId);
        return closeSharedSession({ sessionId, userId });
      });
    });

    socket.on("game:spin", (payload, ack) => {
      void withAck(ack, async () => {
        const sessionId = sessionIdSchema.parse(payload?.sessionId);
        const bet = betSchema.parse(payload?.bet);
        const { ack: spinAck } = await spinShared({ sessionId, userId, bet });
        return spinAck;
      });
    });

    socket.on("game:action", (payload, ack) => {
      void withAck(ack, async () => {
        const sessionId = sessionIdSchema.parse(payload?.sessionId);
        const action = payload?.action;
        if (
          !action ||
          action.kind !== "choose-bonus-path" ||
          !bonusPathSchema.safeParse(action.path).success
        ) {
          throw new Error("Unsupported game action.");
        }
        return performGameAction({
          sessionId,
          userId,
          action: { kind: "choose-bonus-path", path: action.path },
        });
      });
    });

    socket.on("control:request", (payload, ack) => {
      void withAck(ack, async () => {
        const sessionId = sessionIdSchema.parse(payload?.sessionId);
        await requestControl({ sessionId, userId });
        return undefined;
      });
    });

    socket.on("control:pass", (payload, ack) => {
      void withAck(ack, async () => {
        const sessionId = sessionIdSchema.parse(payload?.sessionId);
        const toUserId =
          typeof payload?.toUserId === "string" && payload.toUserId
            ? payload.toUserId
            : undefined;
        return passControl({ sessionId, userId, toUserId });
      });
    });

    socket.on("vote:create", (payload, ack) => {
      void withAck(ack, async () => {
        const sessionId = sessionIdSchema.parse(payload?.sessionId);
        const type = voteTypeSchema.parse(payload?.type);
        const rule = voteRuleSchema.parse(payload?.rule);
        const result = await createSessionVote({
          sessionId,
          userId,
          type,
          payload: payload?.payload,
          rule,
        });
        return result.vote;
      });
    });

    socket.on("vote:cast", (payload, ack) => {
      void withAck(ack, async () => {
        const sessionId = sessionIdSchema.parse(payload?.sessionId);
        const voteId = sessionIdSchema.parse(payload?.voteId);
        const choice = bodySchema.parse(payload?.choice);
        const result = await castVote({ sessionId, userId, voteId, choice });
        return result.vote;
      });
    });

    socket.on("chat:send", (payload, ack) => {
      void withAck(ack, async () => {
        const sessionId = sessionIdSchema.parse(payload?.sessionId);
        const body = bodySchema.parse(payload?.body);
        return sendChat({ sessionId, userId, body });
      });
    });

    socket.on("reaction:send", (payload, ack) => {
      void withAck(ack, async () => {
        const sessionId = sessionIdSchema.parse(payload?.sessionId);
        const emoji = emojiSchema.parse(payload?.emoji);
        await sendReaction({ sessionId, userId, emoji });
        return undefined;
      });
    });

    socket.on("disconnect", () => {
      unsubscribePresence();
      presence.disconnect(socket.id);
    });
  });
}

export type { AppServer, AppSocket };
