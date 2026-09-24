/**
 * SharedPlay Casino — custom server.
 *
 * One process hosts both the Next.js app and Socket.IO so realtime updates and
 * page loads share the same origin, session cookie and server-authoritative
 * services.
 *
 *   pnpm dev            → development (Next dev handler)
 *   pnpm build && start → production (next build output)
 */
import { createServer } from "node:http";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { ensureSqlitePragmas } from "@sharedplay/db";
import { attachRealtime } from "./socket";

const asProduction = process.argv.includes("--prod");
// NODE_ENV is typed read-only in newer @types/node; the custom server must set it.
(process.env as Record<string, string>).NODE_ENV = asProduction
  ? "production"
  : "development";

const dev = !asProduction;
const hostname = process.env.HOSTNAME || "localhost";
const port = Number(process.env.PORT || 3000);

async function main(): Promise<void> {
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();

  // Next loads apps/web/.env during prepare(); everything after this point
  // (socket auth, route handlers) sees AUTH_SECRET and friends.
  await app.prepare();
  await ensureSqlitePragmas();

  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  const io = new SocketIOServer(httpServer, {
    cors: { origin: true, credentials: true },
    maxHttpBufferSize: 100 * 1024,
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });

  attachRealtime(io);

  httpServer.listen(port, () => {
    const display = hostname === "0.0.0.0" ? "localhost" : hostname;
    console.log(
      `\n  ⚡ SharedPlay Casino — ${dev ? "dev" : "prod"} → http://${display}:${port}\n` +
        `  DEMO CREDITS ONLY · demo accounts: george / nick / alex / helen · password demo1234\n`,
    );
  });
}

main().catch((error) => {
  console.error("Failed to start SharedPlay Casino:", error);
  process.exit(1);
});
