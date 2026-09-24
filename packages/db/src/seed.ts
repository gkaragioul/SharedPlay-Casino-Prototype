import bcrypt from "bcryptjs";
import { DEMO_STARTING_BALANCE } from "@sharedplay/types";
import { prisma } from "./client";

/**
 * Seeds the four demo accounts the investor walkthrough uses, plus the game
 * catalogue. Idempotent: safe to run repeatedly.
 *
 * DEMO ONLY — these credentials are intentionally well known.
 */
export const DEMO_PASSWORD = "demo1234";

export const DEMO_USERS = [
  { username: "george", displayName: "George", avatar: "🏛️", isAdmin: true },
  { username: "nick", displayName: "Nick", avatar: "⚡", isAdmin: false },
  { username: "alex", displayName: "Alex", avatar: "🦅", isAdmin: false },
  { username: "helen", displayName: "Helen", avatar: "🌿", isAdmin: false },
] as const;

export const GAMES = [
  {
    slug: "temple-of-zeus",
    name: "Temple of Zeus",
    type: "SLOT",
    multiplayerEnabled: true,
  },
  {
    slug: "roulette",
    name: "European Roulette",
    type: "ROULETTE",
    multiplayerEnabled: true,
  },
] as const;

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  for (const user of DEMO_USERS) {
    await prisma.user.upsert({
      where: { username: user.username },
      update: {
        displayName: user.displayName,
        avatar: user.avatar,
        isAdmin: user.isAdmin,
      },
      create: {
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
        isAdmin: user.isAdmin,
        passwordHash,
        demoBalance: DEMO_STARTING_BALANCE,
      },
    });
  }

  for (const game of GAMES) {
    await prisma.game.upsert({
      where: { slug: game.slug },
      update: { name: game.name, type: game.type, multiplayerEnabled: game.multiplayerEnabled },
      create: {
        slug: game.slug,
        name: game.name,
        type: game.type,
        multiplayerEnabled: game.multiplayerEnabled,
      },
    });
  }

  const [users, games] = await Promise.all([
    prisma.user.count(),
    prisma.game.count(),
  ]);
  console.log(`Seed complete — ${users} users, ${games} games.`);
  console.log(`Demo login: ${DEMO_USERS.map((u) => u.username).join(" / ")} — password "${DEMO_PASSWORD}"`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
