/**
 * SharedPlay engine — the multiplayer domain behind the casino.
 *
 * Deliberately framework-free and I/O-free: pure rules for ownership, ledger
 * hashing, voting, control rotation and session validation. The web app's
 * session service persists and broadcasts; games only ever see GameEngine
 * calls. This boundary is what a future SharedPlay SDK would expose to
 * third-party casino operators.
 */
export * from "./ownership";
export * from "./ledger";
export * from "./votes";
export * from "./control";
export * from "./session";
export * from "./replay";
