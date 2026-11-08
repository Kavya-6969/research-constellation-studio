import { describe, it, expect } from "vitest";
import { applyOutcome, START_SCORE, type AgentState } from "./scoring";
const a: AgentState = { id: "literature", name: "L", status: "idle", score: START_SCORE, successes: 0, failures: 0, step: "" };
describe("agent scoring", () => {
  it("approved node adds 10", () => expect(applyOutcome(a, "approved").score).toBe(60));
  it("rejected node subtracts 5", () => expect(applyOutcome(a, "rejected").score).toBe(45));
  it("failed task subtracts 15", () => expect(applyOutcome(a, "failed").score).toBe(35));
  it("retires at 20 or below", () => {
    const r = applyOutcome(applyOutcome(a, "failed"), "failed");
    expect(r.score).toBe(20); expect(r.status).toBe("retired");
  });
  it("controller is never retired", () => {
    const c = { ...a, id: "controller" as const, score: 25 };
    expect(applyOutcome(c, "failed").status).toBe("idle");
  });
});
