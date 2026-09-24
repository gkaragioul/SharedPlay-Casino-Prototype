/**
 * Per-session / per-user async mutexes.
 *
 * Stored on `globalThis` for the same reason as presence: the custom server
 * (tsx) and Next's route-handler bundle are separate module graphs inside one
 * process, and they must share one lock table or the lock is meaningless.
 */

interface LockStore {
  sessionTails: Map<string, Promise<unknown>>;
  userTails: Map<string, Promise<unknown>>;
}

const g = globalThis as unknown as { __sharedplayLocks?: LockStore };

const store: LockStore =
  g.__sharedplayLocks ?? ({ sessionTails: new Map(), userTails: new Map() } satisfies LockStore);
g.__sharedplayLocks = store;

function runExclusive<T>(map: Map<string, Promise<unknown>>, key: string, task: () => Promise<T>): Promise<T> {
  const previous = map.get(key) ?? Promise.resolve();
  const run = previous.then(task, task);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  map.set(key, tail);
  void tail.then(() => {
    if (map.get(key) === tail) map.delete(key);
  });
  return run;
}

/** Serializes every mutation of one shared session (spins, votes, settlement). */
export function withSessionLock<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
  return runExclusive(store.sessionTails, sessionId, task);
}

/** Serializes wallet mutations for one user (solo spins, sign-up credits). */
export function withUserLock<T>(userId: string, task: () => Promise<T>): Promise<T> {
  return runExclusive(store.userTails, userId, task);
}
