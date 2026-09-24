/**
 * Control flow for a shared session.
 *
 * Exactly one participant holds control at a time; only that player may execute
 * primary game actions. Control can be passed manually, requested by anyone,
 * and rotated automatically every N spins so a session never bottlenecks on one
 * player.
 */

export interface ControllerCandidate {
  userId: string;
  /** Participants who have left the active wagering portion cannot control. */
  active: boolean;
}

export interface ControlDecision {
  controllerId: string | null;
  reason: "manual-pass" | "auto-rotate" | "controller-left" | "initial" | "none";
}

export function canExecute(userId: string, controllerId: string | null): boolean {
  return controllerId !== null && userId === controllerId;
}

/** True when this spin should trigger an automatic rotation. */
export function shouldAutoRotate(spinCount: number, every: number): boolean {
  if (!Number.isFinite(every) || every <= 0) return false;
  return spinCount > 0 && spinCount % every === 0;
}

/**
 * Picks the next controller: the active participant after `currentId` in join
 * order, wrapping around. Returns null when nobody is active.
 */
export function nextController(
  orderedCandidates: readonly ControllerCandidate[],
  currentId: string | null,
): string | null {
  const active = orderedCandidates.filter((candidate) => candidate.active);
  if (active.length === 0) return null;
  const currentIndex = active.findIndex((candidate) => candidate.userId === currentId);
  if (currentIndex === -1) return active[0]!.userId;
  return active[(currentIndex + 1) % active.length]!.userId;
}

export function resolveControlAfterSpin(input: {
  orderedCandidates: readonly ControllerCandidate[];
  currentControllerId: string | null;
  spinCount: number;
  rotationEvery: number;
}): ControlDecision {
  const stillActive = input.orderedCandidates.some(
    (candidate) => candidate.userId === input.currentControllerId && candidate.active,
  );
  if (!stillActive) {
    return {
      controllerId: nextController(input.orderedCandidates, null),
      reason: "controller-left",
    };
  }
  if (shouldAutoRotate(input.spinCount, input.rotationEvery)) {
    return {
      controllerId: nextController(input.orderedCandidates, input.currentControllerId),
      reason: "auto-rotate",
    };
  }
  return { controllerId: input.currentControllerId, reason: "none" };
}

export interface PendingControlRequest {
  byUserId: string;
  byName: string;
  requestedAt: Date;
}

/**
 * Control requests are single-flight: a second request from the same player
 * replaces their earlier one instead of queueing duplicates.
 */
export function upsertControlRequest(
  existing: readonly PendingControlRequest[],
  request: PendingControlRequest,
): PendingControlRequest[] {
  return [...existing.filter((entry) => entry.byUserId !== request.byUserId), request];
}

export function clearControlRequest(
  existing: readonly PendingControlRequest[],
  userId: string,
): PendingControlRequest[] {
  return existing.filter((entry) => entry.byUserId !== userId);
}
