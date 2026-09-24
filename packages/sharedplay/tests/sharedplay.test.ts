import { describe, expect, it } from "vitest";
import {
  canExecute,
  clearControlRequest,
  nextController,
  resolveControlAfterSpin,
  shouldAutoRotate,
  upsertControlRequest,
  type ControllerCandidate,
} from "../src/control";
import {
  assertBettingAllowed,
  assertContributionAllowed,
  canTransition,
  formatOwnershipPercent,
  generateInviteToken,
  generateSessionCode,
  isLargeBet,
  randomCode,
  validateBet,
  validateContribution,
} from "../src/session";

const TWO: ControllerCandidate[] = [
  { userId: "george", active: true },
  { userId: "nick", active: true },
];

describe("control", () => {
  it("lets only the controller execute", () => {
    expect(canExecute("george", "george")).toBe(true);
    expect(canExecute("nick", "george")).toBe(false);
    expect(canExecute("george", null)).toBe(false);
  });

  it("rotates control every N spins", () => {
    expect(shouldAutoRotate(10, 10)).toBe(true);
    expect(shouldAutoRotate(9, 10)).toBe(false);
    expect(shouldAutoRotate(0, 10)).toBe(false);
    expect(shouldAutoRotate(10, 0)).toBe(false);
  });

  it("passes control to the next active participant", () => {
    expect(nextController(TWO, "george")).toBe("nick");
    expect(nextController(TWO, "nick")).toBe("george");
    expect(nextController(TWO, null)).toBe("george");
    expect(nextController([{ userId: "a", active: false }], "a")).toBeNull();
  });

  it("auto-rotates after the configured number of spins", () => {
    const decision = resolveControlAfterSpin({
      orderedCandidates: TWO,
      currentControllerId: "george",
      spinCount: 10,
      rotationEvery: 10,
    });
    expect(decision).toEqual({ controllerId: "nick", reason: "auto-rotate" });
  });

  it("keeps control between rotations", () => {
    const decision = resolveControlAfterSpin({
      orderedCandidates: TWO,
      currentControllerId: "george",
      spinCount: 3,
      rotationEvery: 10,
    });
    expect(decision).toEqual({ controllerId: "george", reason: "none" });
  });

  it("moves control away when the controller leaves", () => {
    const decision = resolveControlAfterSpin({
      orderedCandidates: [
        { userId: "george", active: false },
        { userId: "nick", active: true },
      ],
      currentControllerId: "george",
      spinCount: 1,
      rotationEvery: 10,
    });
    expect(decision).toEqual({ controllerId: "nick", reason: "controller-left" });
  });

  it("deduplicates control requests per user", () => {
    const first = upsertControlRequest([], {
      byUserId: "nick",
      byName: "Nick",
      requestedAt: new Date(1000),
    });
    const second = upsertControlRequest(first, {
      byUserId: "nick",
      byName: "Nick",
      requestedAt: new Date(2000),
    });
    expect(second).toHaveLength(1);
    expect(second[0]!.requestedAt.getTime()).toBe(2000);

    const third = upsertControlRequest(second, {
      byUserId: "alex",
      byName: "Alex",
      requestedAt: new Date(3000),
    });
    expect(third).toHaveLength(2);

    expect(clearControlRequest(third, "nick")).toHaveLength(1);
  });
});

describe("session rules", () => {
  it("generates unambiguous codes", () => {
    const code = generateSessionCode();
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(generateInviteToken()).toHaveLength(24);
    expect(randomCode(8)).toHaveLength(8);
    // Two calls are astronomically unlikely to collide.
    expect(generateSessionCode()).not.toBe(generateSessionCode());
  });

  it("validates contributions", () => {
    const base = {
      userBalance: 10_000,
      sessionStatus: "LOBBY" as const,
      alreadyJoined: false,
      participantCount: 1,
      maxParticipants: 8,
    };
    expect(validateContribution({ ...base, amount: 500 })).toEqual({ ok: true });
    expect(validateContribution({ ...base, amount: 5 }).reason).toBe("BELOW_MINIMUM");
    expect(validateContribution({ ...base, amount: 0 }).reason).toBe("INVALID_AMOUNT");
    expect(validateContribution({ ...base, amount: 1.5 }).reason).toBe("INVALID_AMOUNT");
    expect(validateContribution({ ...base, amount: 20_000 }).reason).toBe("INSUFFICIENT_BALANCE");
    expect(validateContribution({ ...base, sessionStatus: "ACTIVE" }).reason).toBe(
      "SESSION_NOT_JOINABLE",
    );
    expect(validateContribution({ ...base, alreadyJoined: true }).reason).toBe("ALREADY_JOINED");
    expect(validateContribution({ ...base, participantCount: 8 }).reason).toBe("SESSION_FULL");
  });

  it("validates bets against the shared bankroll", () => {
    const levels = [1, 2, 5, 10, 20, 50] as const;
    expect(validateBet({ bet: 20, bankroll: 1000, betLevels: levels })).toEqual({ ok: true });
    expect(validateBet({ bet: 20, bankroll: 10, betLevels: levels }).reason).toBe(
      "INSUFFICIENT_BANKROLL",
    );
    expect(validateBet({ bet: -5, bankroll: 1000, betLevels: levels }).reason).toBe("INVALID_BET");
    expect(validateBet({ bet: 9999, bankroll: 1000, betLevels: levels, maxBet: 500 }).reason).toBe(
      "ABOVE_MAX",
    );
  });

  it("flags large bets that need a vote", () => {
    const levels = [1, 2, 5, 10, 20, 50, 100, 200] as const;
    // 15% of the bankroll >= 15% threshold.
    expect(isLargeBet(150, 1000)).toBe(true);
    expect(isLargeBet(100, 1000)).toBe(false);
    const blocked = validateBet({ bet: 200, bankroll: 1000, betLevels: levels });
    expect(blocked.reason).toBe("LARGE_BET_VOTE_REQUIRED");
    const allowed = validateBet({
      bet: 200,
      bankroll: 1000,
      betLevels: levels,
      largeBetVotePassed: true,
    });
    expect(allowed).toEqual({ ok: true });
  });

  it("enforces the session state machine", () => {
    expect(canTransition("LOBBY", "ACTIVE")).toBe(true);
    expect(canTransition("LOBBY", "CLOSED")).toBe(true);
    expect(canTransition("ACTIVE", "LOBBY")).toBe(false);
    expect(canTransition("CLOSED", "ACTIVE")).toBe(false);
    expect(canTransition("CLOSED", "CLOSED")).toBe(false);

    expect(assertBettingAllowed("ACTIVE").ok).toBe(true);
    expect(assertBettingAllowed("LOBBY").ok).toBe(false);
    expect(assertContributionAllowed("LOBBY").ok).toBe(true);
    expect(assertContributionAllowed("ACTIVE").ok).toBe(false);
  });

  it("formats ownership for display", () => {
    expect(formatOwnershipPercent(5000)).toBe("50%");
    expect(formatOwnershipPercent(3333)).toBe("33.33%");
  });
});
