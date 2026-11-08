export type AgentId = "controller" | "literature" | "environment" | "experiment";
export type AgentStatus = "idle" | "running" | "waiting" | "complete" | "retired";
export type Outcome = "approved" | "rejected" | "failed";
export type AgentState = { id: AgentId; name: string; status: AgentStatus; score: number; successes: number; failures: number; step: string };

export const START_SCORE = 50;
export const RETIRE_AT = 20;
export const REWARD: Record<Outcome, number> = { approved: 10, rejected: -5, failed: -15 };

/** Apply a task outcome. Agents whose score drops to RETIRE_AT or below are retired. */
export function applyOutcome(a: AgentState, o: Outcome): AgentState {
  const score = Math.max(0, Math.min(100, a.score + REWARD[o]));
  const retired = a.id !== "controller" && score <= RETIRE_AT;
  return {
    ...a, score,
    successes: a.successes + (o === "approved" ? 1 : 0),
    failures: a.failures + (o === "approved" ? 0 : 1),
    status: retired ? "retired" : a.status,
  };
}

export const reinstate = (a: AgentState): AgentState => ({ ...a, score: START_SCORE, status: "idle", step: "" });
