import type { Server as SocketIOServer } from "socket.io";

/**
 * Process-wide handle to the live Socket.IO server, shared across the tsx
 * server and Next's bundled route handlers via `globalThis` (same trick as the
 * lock table). Route handlers (invites, friend requests) can push realtime
 * events without importing the server entrypoint.
 */
interface BusStore {
  io: SocketIOServer | null;
}

const g = globalThis as unknown as { __sharedplayBus?: BusStore };
const store: BusStore = g.__sharedplayBus ?? { io: null };
g.__sharedplayBus = store;

export function setIo(io: SocketIOServer): void {
  store.io = io;
}

export function getIo(): SocketIOServer | null {
  return store.io;
}

export function emitToSession(sessionId: string, event: string, payload: unknown): void {
  store.io?.to(`session:${sessionId}`).emit(event, payload);
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  store.io?.to(`user:${userId}`).emit(event, payload);
}

/** Live bell notification (also persisted by the caller). */
export function pushNotification(payload: {
  userId: string;
  id: string;
  type: string;
  title: string;
  body?: string | null;
  createdAt?: Date;
}): void {
  emitToUser(payload.userId, "notification", {
    id: payload.id,
    type: payload.type,
    title: payload.title,
    body: payload.body ?? null,
    createdAt: (payload.createdAt ?? new Date()).toISOString(),
  });
}
