import { describe, expect, it } from "vitest";
import { defaultRuleFor, shouldSettle, tallyVote } from "../src/votes";

const ELIGIBLE = ["george", "nick"];

describe("tallyVote — YES/NO", () => {
  it("stays open until the outcome is decided", () => {
    const outcome = tallyVote({
      type: "CASH_OUT",
      rule: "UNANIMOUS",
      eligibleUserIds: ELIGIBLE,
      responses: [{ userId: "george", choice: "YES" }],
    });
    expect(outcome.status).toBe("OPEN");
    expect(outcome.pending).toEqual(["nick"]);
    expect(outcome.yes).toBe(1);
  });

  it("passes a unanimous vote when everyone says yes", () => {
    const outcome = tallyVote({
      type: "CASH_OUT",
      rule: "UNANIMOUS",
      eligibleUserIds: ELIGIBLE,
      responses: [
        { userId: "george", choice: "YES" },
        { userId: "nick", choice: "YES" },
      ],
    });
    expect(outcome.status).toBe("PASSED");
    expect(shouldSettle("CASH_OUT", outcome)).toBe(true);
  });

  it("fails a unanimous vote on a single no", () => {
    const outcome = tallyVote({
      type: "CASH_OUT",
      rule: "UNANIMOUS",
      eligibleUserIds: ELIGIBLE,
      responses: [
        { userId: "george", choice: "YES" },
        { userId: "nick", choice: "NO" },
      ],
    });
    expect(outcome.status).toBe("FAILED");
    expect(shouldSettle("CASH_OUT", outcome)).toBe(false);
  });

  it("decides a majority vote early when the result cannot change", () => {
    const outcome = tallyVote({
      type: "PASS_CONTROL",
      rule: "MAJORITY",
      eligibleUserIds: ["a", "b", "c"],
      responses: [
        { userId: "a", choice: "YES" },
        { userId: "b", choice: "YES" },
      ],
    });
    expect(outcome.status).toBe("PASSED");
    expect(outcome.pending).toEqual(["c"]);
  });

  it("fails a majority vote early when no is already past half", () => {
    const outcome = tallyVote({
      type: "LARGE_BET",
      rule: "MAJORITY",
      eligibleUserIds: ["a", "b", "c"],
      responses: [
        { userId: "a", choice: "NO" },
        { userId: "b", choice: "NO" },
      ],
    });
    expect(outcome.status).toBe("FAILED");
  });

  it("ignores responses from non-participants", () => {
    const outcome = tallyVote({
      type: "CASH_OUT",
      rule: "UNANIMOUS",
      eligibleUserIds: ELIGIBLE,
      responses: [
        { userId: "george", choice: "YES" },
        { userId: "stranger", choice: "NO" },
      ],
    });
    expect(outcome.status).toBe("OPEN");
    expect(outcome.total).toBe(1);
  });

  it("uses the latest response from each voter", () => {
    const outcome = tallyVote({
      type: "CASH_OUT",
      rule: "UNANIMOUS",
      eligibleUserIds: ELIGIBLE,
      responses: [
        { userId: "george", choice: "NO" },
        { userId: "nick", choice: "YES" },
        { userId: "george", choice: "YES" },
      ],
    });
    expect(outcome.yes).toBe(2);
    expect(outcome.no).toBe(0);
    expect(outcome.status).toBe("PASSED");
  });

  it("resolves ties as failures for binary votes", () => {
    const outcome = tallyVote({
      type: "PASS_CONTROL",
      rule: "MAJORITY",
      eligibleUserIds: ELIGIBLE,
      responses: [
        { userId: "george", choice: "YES" },
        { userId: "nick", choice: "NO" },
      ],
    });
    expect(outcome.status).toBe("FAILED");
  });
});

describe("tallyVote — plurality (bonus path)", () => {
  it("passes early once an option holds more than half", () => {
    const outcome = tallyVote({
      type: "BONUS_OPTION",
      rule: "MAJORITY",
      eligibleUserIds: ["a", "b", "c"],
      optionOrder: ["LIGHTNING", "SHIELD"],
      responses: [
        { userId: "a", choice: "LIGHTNING" },
        { userId: "b", choice: "LIGHTNING" },
      ],
    });
    expect(outcome.status).toBe("PASSED");
    expect(outcome.winner).toBe("LIGHTNING");
  });

  it("waits for full turnout and reports the leader", () => {
    const outcome = tallyVote({
      type: "BONUS_OPTION",
      rule: "MAJORITY",
      eligibleUserIds: ["a", "b", "c"],
      optionOrder: ["LIGHTNING", "SHIELD"],
      responses: [
        { userId: "a", choice: "LIGHTNING" },
        { userId: "b", choice: "SHIELD" },
      ],
    });
    expect(outcome.status).toBe("OPEN");
    expect(outcome.leader).toBe("LIGHTNING");
    expect(outcome.pending).toEqual(["c"]);
  });

  it("breaks full-turnout ties by declared option order", () => {
    const outcome = tallyVote({
      type: "BONUS_OPTION",
      rule: "MAJORITY",
      eligibleUserIds: ELIGIBLE,
      optionOrder: ["LIGHTNING", "SHIELD"],
      responses: [
        { userId: "george", choice: "SHIELD" },
        { userId: "nick", choice: "LIGHTNING" },
      ],
    });
    expect(outcome.status).toBe("PASSED");
    expect(outcome.winner).toBe("LIGHTNING");
  });
});

describe("vote defaults", () => {
  it("defaults cash out to unanimity and everything else to majority", () => {
    expect(defaultRuleFor("CASH_OUT")).toBe("UNANIMOUS");
    expect(defaultRuleFor("LARGE_BET")).toBe("MAJORITY");
    expect(defaultRuleFor("PASS_CONTROL")).toBe("MAJORITY");
    expect(defaultRuleFor("BONUS_OPTION")).toBe("MAJORITY");
  });
});
