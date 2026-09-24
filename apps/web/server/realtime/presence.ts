/**
 * Presence tracking: which users are connected, and to which sessions.
 *
 * The Maps live on `globalThis` because this module is loaded twice in one
 * process — once by the tsx-hosted custom server (Socket.IO) and once inside
 * Next's bundle (server components reading initial state). A plain module-level
 * Map would give each copy its own world.
 */

type PresenceListener = (payload: { userId: string; online: boolean }) => void;

interface PresenceStore {
  userSockets: Map<string, Set<string>>;
  socketMeta: Map<string, { userId: string; sessions: Set<string> }>;
  sessions: Map<string, { users: Map<string, Set<string>> }>;
  listeners: Set<PresenceListener>;
}

const g = globalThis as unknown as { __sharedplayPresence?: PresenceStore };

const store: PresenceStore =
  g.__sharedplayPresence ??
  ({
    userSockets: new Map(),
    socketMeta: new Map(),
    sessions: new Map(),
    listeners: new Set(),
  } satisfies PresenceStore);

g.__sharedplayPresence = store;

function emit(userId: string, online: boolean): void {
  for (const listener of store.listeners) listener({ userId, online });
}

export const presence = {
  connect(userId: string, socketId: string): void {
    let sockets = store.userSockets.get(userId);
    const wasOnline = (sockets?.size ?? 0) > 0;
    if (!sockets) {
      sockets = new Set();
      store.userSockets.set(userId, sockets);
    }
    sockets.add(socketId);
    store.socketMeta.set(socketId, { userId, sessions: new Set() });
    if (!wasOnline) emit(userId, true);
  },

  disconnect(socketId: string): void {
    const meta = store.socketMeta.get(socketId);
    if (!meta) return;
    for (const sessionId of meta.sessions) {
      const room = store.sessions.get(sessionId);
      if (!room) continue;
      const sockets = room.users.get(meta.userId);
      sockets?.delete(socketId);
      if (sockets && sockets.size === 0) room.users.delete(meta.userId);
      if (room.users.size === 0) store.sessions.delete(sessionId);
    }
    store.socketMeta.delete(socketId);

    const sockets = store.userSockets.get(meta.userId);
    sockets?.delete(socketId);
    if (sockets && sockets.size === 0) {
      store.userSockets.delete(meta.userId);
      emit(meta.userId, false);
    }
  },

  joinSession(sessionId: string, userId: string, socketId: string): void {
    let room = store.sessions.get(sessionId);
    if (!room) {
      room = { users: new Map() };
      store.sessions.set(sessionId, room);
    }
    let sockets = room.users.get(userId);
    if (!sockets) {
      sockets = new Set();
      room.users.set(userId, sockets);
    }
    sockets.add(socketId);
    store.socketMeta.get(socketId)?.sessions.add(sessionId);
  },

  leaveSession(sessionId: string, userId: string, socketId: string): void {
    const room = store.sessions.get(sessionId);
    if (!room) return;
    const sockets = room.users.get(userId);
    sockets?.delete(socketId);
    if (sockets && sockets.size === 0) room.users.delete(userId);
    if (room.users.size === 0) store.sessions.delete(sessionId);
    store.socketMeta.get(socketId)?.sessions.delete(sessionId);
  },

  onlineIn(sessionId: string): Set<string> {
    return new Set(store.sessions.get(sessionId)?.users.keys() ?? []);
  },

  isOnline(userId: string): boolean {
    return (store.userSockets.get(userId)?.size ?? 0) > 0;
  },

  onlineUserIds(): string[] {
    return [...store.userSockets.keys()];
  },

  onChange(listener: PresenceListener): () => void {
    store.listeners.add(listener);
    return () => store.listeners.delete(listener);
  },
};
