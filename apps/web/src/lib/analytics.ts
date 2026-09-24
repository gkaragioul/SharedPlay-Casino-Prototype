import { prisma } from "@sharedplay/db";
import type { AnalyticsEventInput } from "@sharedplay/types";

function jsonOrUndefined(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  return value as Record<string, unknown>;
}

/**
 * Day-one event tracking. Every meaningful action lands in `AnalyticsEvent`;
 * the investor dashboard reads from that table. Failures never break gameplay.
 */
export function track(input: AnalyticsEventInput): void {
  void prisma.analyticsEvent
    .create({
      data: {
        name: input.name,
        userId: input.userId ?? null,
        sessionId: input.sessionId ?? null,
        squadId: input.squadId ?? null,
        props: jsonOrUndefined(input.props) as never,
      },
    })
    .catch((error: unknown) => {
      console.error("[analytics]", input.name, error);
    });
}

/** Session-activity feed row (shown in the SharedPlay panel). Awaitable. */
export function recordActivity(input: {
  sessionId: string;
  userId: string | null;
  type: string;
  message: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  return prisma.sessionActivity
    .create({
      data: {
        sessionId: input.sessionId,
        userId: input.userId,
        type: input.type,
        message: input.message,
        metadata: jsonOrUndefined(input.metadata) as never,
      },
    })
    .then(() => undefined)
    .catch((error: unknown) => {
      console.error("[activity]", error);
    });
}

export function notify(input: {
  userId: string;
  type: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}): void {
  void prisma.notification
    .create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        data: jsonOrUndefined(input.data) as never,
      },
    })
    .catch((error: unknown) => console.error("[notification]", error));
}
