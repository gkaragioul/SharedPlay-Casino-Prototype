import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed session cookie shared by Next route handlers, server components and
 * the Socket.IO middleware. HMAC-SHA256, httpOnly, sameSite=lax.
 *
 * The browser never carries a balance or identity we trust — this token only
 * says *who* is connected; every mutation re-reads the database.
 */

export const SESSION_COOKIE = "sp_session";
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

/** Read lazily: Next loads `.env` during `app.prepare()`, after module import. */
function secret(): string {
  return process.env.AUTH_SECRET || "sharedplay-dev-secret";
}

export interface SessionPayload {
  userId: string;
  /** Issued-at, unix seconds. */
  iat: number;
}

export function signSession(userId: string): string {
  const payload: SessionPayload = { userId, iat: Math.floor(Date.now() / 1000) };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySession(token: string | null | undefined): SessionPayload | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const sigBuf = Buffer.from(sig, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!parsed || typeof parsed.userId !== "string" || typeof parsed.iat !== "number") {
      return null;
    }
    if (Date.now() / 1000 - parsed.iat > SESSION_MAX_AGE_S) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Cookie attributes for route handlers / server actions. */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" && process.env.AUTH_TRUST_HOST !== "true",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  };
}

/** Parses a raw `Cookie:` header (Socket.IO handshakes). */
export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}
