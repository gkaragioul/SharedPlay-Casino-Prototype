import { z } from "zod";
import { prisma } from "@sharedplay/db";
import { getGameEngine, createRng } from "@sharedplay/games";
import { requireApiUser, ApiHttpError } from "@/lib/auth";
import { track } from "@/lib/analytics";
import { checkResponsibleGaming } from "../../../../../server/realtime/rg";

const spinSchema = z.object({
  slug: z.string().min(1),
  bet: z.number().int().positive(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser();
    const body = await request.json();
    const parsed = spinSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid spin request." }, { status: 400 });
    }

    const { slug, bet } = parsed.data;
    const game = await prisma.game.findUnique({ where: { slug } });
    if (!game) throw new ApiHttpError(404, "Game not found.");

    const engine = getGameEngine(slug);
    if (!engine) throw new ApiHttpError(404, "Engine not loaded.");
    if (!engine.betLevels.includes(bet as never)) {
      return Response.json({ error: "Pick a valid bet level." }, { status: 400 });
    }

    const rg = await checkResponsibleGaming(user.id, bet);
    if (!rg.ok) {
      return Response.json({ error: rg.message, code: rg.reason }, { status: 403 });
    }

    const rngMode = process.env.RNG_MODE === "seeded" ? "seeded" : "random";
    const rng =
      rngMode === "seeded"
        ? createRng({ mode: "seeded", seed: `solo-${user.id}-${Date.now()}` })
        : createRng({ mode: "random" });

    const outcome = await prisma.$transaction(async (tx) => {
      const fresh = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (fresh.demoBalance < bet) {
        throw new ApiHttpError(402, "Not enough demo credits.");
      }

      let state = engine.createState({ bet });
      const placed = engine.placeBet(state, bet);
      if (!placed.accepted) {
        throw new ApiHttpError(400, placed.reason ?? "Bet rejected.");
      }
      state = placed.state;

      const resolution = engine.resolveRound(state, {
        rng,
        roundId: crypto.randomUUID(),
        multiplayer: false,
      });
      if (!resolution.accepted) {
        throw new ApiHttpError(400, resolution.reason ?? "Round rejected.");
      }

      const afterBet = fresh.demoBalance - bet;
      const bankroll = afterBet + resolution.payout;

      await tx.user.update({
        where: { id: user.id },
        data: { demoBalance: bankroll },
      });
      await tx.gameRound.create({
        data: {
          userId: user.id,
          gameId: game.id,
          bet,
          payout: resolution.payout,
          result: resolution.view as object,
          bonusTriggered: resolution.bonusTriggered,
        },
      });

      return {
        bankroll,
        payout: resolution.payout,
        bonusTriggered: resolution.bonusTriggered,
        view: resolution.view,
        bet,
      };
    });

    track({
      name: "bet_placed",
      userId: user.id,
      props: { bet, game: slug, mode: "solo" },
    });
    track({
      name: "game_result",
      userId: user.id,
      props: {
        payout: outcome.payout,
        bet,
        bonusTriggered: outcome.bonusTriggered,
        mode: "solo",
      },
    });

    return Response.json(outcome);
  } catch (error) {
    if (error instanceof ApiHttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("[solo/spin]", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
