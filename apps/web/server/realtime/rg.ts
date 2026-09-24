import type { PrismaClient, Prisma } from "@sharedplay/db";
import { prisma } from "@sharedplay/db";
import { track } from "../../src/lib/analytics";

/**
 * Responsible-gaming checks (simulated controls, real enforcement in the
 * prototype). Every wager path — solo and shared — calls this before money
 * moves. When a limit trips we log the event and (in shared sessions) step the
 * player back from the wagering portion; we never design a way around it.
 */

export type RgVerdict =
  | { ok: true }
  | { ok: false; reason: "BREAK" | "LOSS_LIMIT" | "DAILY_LIMIT"; message: string };

export interface RgSettings {
  dailyDemoLimit: number | null;
  sessionDurationReminderMin: number | null;
  lossLimit: number | null;
  breakUntil: Date | null;
}

export async function loadRgSettings(userId: string): Promise<RgSettings> {
  const row = await prisma.responsibleGamingSettings.findUnique({ where: { userId } });
  return {
    dailyDemoLimit: row?.dailyDemoLimit ?? null,
    sessionDurationReminderMin: row?.sessionDurationReminderMin ?? 60,
    lossLimit: row?.lossLimit ?? null,
    breakUntil: row?.breakUntil ?? null,
  };
}

function startOfUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function todayActivity(userId: string): Promise<{ wagered: number; netLoss: number }> {
  const agg = await prisma.gameRound.aggregate({
    where: { userId, createdAt: { gte: startOfUtcDay() } },
    _sum: { bet: true, payout: true },
  });
  const wagered = agg._sum.bet ?? 0;
  const won = agg._sum.payout ?? 0;
  return { wagered, netLoss: Math.max(0, wagered - won) };
}

export async function checkResponsibleGaming(
  userId: string,
  stake: number,
): Promise<RgVerdict> {
  const settings = await loadRgSettings(userId);

  if (settings.breakUntil && settings.breakUntil.getTime() > Date.now()) {
    const until = settings.breakUntil.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
    track({
      name: "responsible_gaming_triggered",
      userId,
      props: { reason: "BREAK" },
    });
    return {
      ok: false,
      reason: "BREAK",
      message: `You asked to take a break — wagering is paused until ${until}. You can still watch and chat.`,
    };
  }

  const activity = await todayActivity(userId);

  if (settings.dailyDemoLimit != null && activity.wagered + stake > settings.dailyDemoLimit) {
    track({
      name: "responsible_gaming_triggered",
      userId,
      props: { reason: "DAILY_LIMIT", wagered: activity.wagered, limit: settings.dailyDemoLimit },
    });
    return {
      ok: false,
      reason: "DAILY_LIMIT",
      message: `You've reached today's demo play limit of ${settings.dailyDemoLimit.toLocaleString()} credits. Take a break — you can adjust limits in your profile.`,
    };
  }

  if (settings.lossLimit != null && activity.netLoss + stake > settings.lossLimit) {
    track({
      name: "responsible_gaming_triggered",
      userId,
      props: { reason: "LOSS_LIMIT", netLoss: activity.netLoss, limit: settings.lossLimit },
    });
    return {
      ok: false,
      reason: "LOSS_LIMIT",
      message: `You've reached today's demo loss limit of ${settings.lossLimit.toLocaleString()} credits. Stepping you back from wagering — take a break.`,
    };
  }

  return { ok: true };
}

export type Tx = Prisma.TransactionClient | PrismaClient;
