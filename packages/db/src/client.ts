import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "./generated/prisma";

/**
 * Walks up from `start` looking for the pnpm workspace root. This keeps the
 * SQLite file in one predictable place no matter which workspace the process
 * was launched from (repo root, apps/web, or packages/db).
 */
function findRepoRoot(start: string): string {
  let dir = start;
  for (let depth = 0; depth < 8; depth += 1) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

export function resolveDatabaseUrl(): string {
  const configured = process.env.DATABASE_URL;
  if (configured && configured.startsWith("file:")) {
    const filePart = configured.slice("file:".length);
    if (path.isAbsolute(filePart)) return configured;
  }

  const root = findRepoRoot(process.cwd());
  const dbFile = path.join(root, "packages", "db", "prisma", "dev.db");
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  return `file:${dbFile}`;
}

export const databaseUrl = resolveDatabaseUrl();

// Prisma's client reads DATABASE_URL at construction; make sure the resolved
// absolute path is what it sees even when the app never defined it.
process.env.DATABASE_URL = databaseUrl;

const globalForPrisma = globalThis as unknown as { __sharedplayPrisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.__sharedplayPrisma ??
  new PrismaClient({
    datasourceUrl: databaseUrl,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__sharedplayPrisma = prisma;
}

/**
 * SQLite tuning for concurrent access.
 *
 * `journal_mode=WAL` persists in the database file, so it only needs setting
 * once; `busy_timeout` gives writers a grace period instead of failing
 * immediately with SQLITE_BUSY. In-session actions are additionally serialized
 * by the per-session mutex in the web app.
 */
export async function ensureSqlitePragmas(): Promise<void> {
  try {
    await prisma.$queryRawUnsafe("PRAGMA journal_mode=WAL;");
    await prisma.$queryRawUnsafe("PRAGMA busy_timeout=5000;");
  } catch {
    // Pragmas are best-effort; the app still works on a plain SQLite file.
  }
}

export function disconnect(): Promise<void> {
  return prisma.$disconnect();
}
