import { TEMPLE_MULTIPLAYER } from "@sharedplay/games";
import type { BonusPath, VoteType } from "@sharedplay/types";

/**
 * Investor-demo bot ("simulated Nick").
 *
 * Only ever active when a session carries `flags.demoBot` — set exclusively by
 * POST /api/demo/start. Normal prototype play never touches this file, which
 * is what keeps the scripted sequence separate from honest RNG play.
 *
 * The bot performs real service actions through the injected drivers (join,
 * spin, vote, chat…) exactly as a second browser would.
 */

interface BotDrivers {
  join(params: { sessionId: string; userId: string; amount: number }): Promise<unknown>;
  spin(params: { sessionId: string; userId: string; bet: number }): Promise<unknown>;
  requestControl(params: { sessionId: string; userId: string }): Promise<unknown>;
  passControl(params: { sessionId: string; userId: string; toUserId?: string }): Promise<unknown>;
  castVote(params: {
    sessionId: string;
    userId: string;
    voteId: string;
    choice: string;
  }): Promise<unknown>;
  sendChat(params: { sessionId: string; userId: string; body: string }): Promise<unknown>;
  sendReaction(params: { sessionId: string; userId: string; emoji: string }): Promise<unknown>;
  forceTeamBonus(params: { sessionId: string }): Promise<unknown>;
  getOpenVote(sessionId: string): Promise<{
    id: string;
    type: string;
    payload: Record<string, unknown> | null;
    responses: { userId: string; choice: string }[];
  } | null>;
}

let drivers: BotDrivers | null = null;

export function registerBotDrivers(next: BotDrivers): void {
  drivers = next;
}

function schedule(ms: number, task: () => Promise<unknown>, label: string, retries = 2): void {
  const timer = setTimeout(() => {
    task().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (retries > 0 && /vote|progress|pending/i.test(message)) {
        schedule(1800, task, label, retries - 1);
        return;
      }
      console.warn(`[demo-bot] ${label}: ${message}`);
    });
  }, ms);
  // Never keep the process alive just for the bot.
  timer.unref?.();
}

export function isDemoSession(flags: { demoBot?: boolean }): boolean {
  return flags.demoBot === true && drivers !== null;
}

export function onDemoSessionCreated(params: {
  sessionId: string;
  botUserId: string;
  contribution: number;
}): void {
  if (!drivers) return;
  schedule(
    1100,
    () => drivers!.join({
      sessionId: params.sessionId,
      userId: params.botUserId,
      amount: params.contribution,
    }),
    "join",
  );
}

export function onDemoSessionStarted(params: { sessionId: string; botUserId: string }): void {
  if (!drivers) return;
  schedule(
    700,
    () => drivers!.sendChat({
      sessionId: params.sessionId,
      userId: params.botUserId,
      body: "joined — let's ride ⚡",
    }),
    "welcome-chat",
  );
}

export function onDemoSpin(params: {
  sessionId: string;
  spinCount: number;
  controllerId: string | null;
  botUserId: string;
}): void {
  if (!drivers) return;
  const { sessionId, spinCount, controllerId, botUserId } = params;

  // The bot cheers the host's first spin, then asks for the controls.
  if (spinCount === 1) {
    schedule(
      900,
      () => drivers!.sendReaction({ sessionId, userId: botUserId, emoji: "🔥" }),
      "cheer",
    );
  }
  if (spinCount === 2 && controllerId !== botUserId) {
    schedule(
      900,
      () => drivers!.requestControl({ sessionId, userId: botUserId }),
      "request-control",
    );
  }
  // Scripted ZEUS POWER team bonus — the multiplayer money-shot.
  if (spinCount === 4) {
    schedule(1500, () => drivers!.forceTeamBonus({ sessionId }), "force-team-bonus", 4);
  }
  // Bot hands control back after its own spin so the demo ends on the host.
  if (controllerId === botUserId && spinCount >= 5) {
    schedule(
      1600,
      () => drivers!.passControl({ sessionId, userId: botUserId }),
      "pass-back",
    );
  }
}

export function onDemoControlChanged(params: {
  sessionId: string;
  currentControllerId: string | null;
  botUserId: string;
}): void {
  if (!drivers) return;
  if (params.currentControllerId !== params.botUserId) return;
  schedule(
    1100,
    () => drivers!.spin({ sessionId: params.sessionId, userId: params.botUserId, bet: 10 }),
    "bot-spin",
  );
}

export function onDemoVoteCreated(params: {
  sessionId: string;
  voteId: string;
  type: VoteType;
  payload: Record<string, unknown> | null;
  botUserId: string;
}): void {
  if (!drivers) return;
  const { sessionId, voteId, type, payload, botUserId } = params;

  schedule(
    2500,
    async () => {
      // Mirror the human's choice when they have already voted (always agreeable
      // in a demo); otherwise take the first option / YES.
      const open = await drivers!.getOpenVote(sessionId);
      const humanResponse = open?.responses.find((response) => response.userId !== botUserId);
      let choice: string;
      if (type === "BONUS_OPTION") {
        const options = Array.isArray(payload?.options)
          ? (payload!.options as { id: BonusPath }[])
          : [];
        choice = humanResponse?.choice ?? options[0]?.id ?? "LIGHTNING";
      } else {
        choice = humanResponse?.choice ?? "YES";
      }
      if (open && open.responses.some((response) => response.userId === botUserId)) return;
      await drivers!.castVote({ sessionId, userId: botUserId, voteId, choice });
    },
    "vote",
  );
}

/** Mapped so the demo's forced bonus matches the engine's own options. */
export function demoBonusOptions(): {
  id: BonusPath;
  label: string;
  description: string;
  spins: number;
  multiplier: number;
}[] {
  return (["LIGHTNING", "SHIELD"] as BonusPath[]).map((id) => {
    const path = TEMPLE_MULTIPLAYER.bonusPaths[id];
    return {
      id,
      label: path.label,
      description: path.description,
      spins: path.spins,
      multiplier: path.multiplier,
    };
  });
}
