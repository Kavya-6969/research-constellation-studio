import { describe, expect, it } from "vitest";
import { buildResearchReport, researchReportMarkdown } from "./research-report";
import { createExperiment, DEFAULT_PARAMETERS } from "./experiments";
import { listDirty } from "./offline-cache";
import { readAgentLog, writeAgentLog, AGENT_LOG_LIMIT, type AgentLogEntry } from "./agent-log";

const nodes = [
  { id: "p", position: { x: 0, y: 0 }, data: { kind: "paper", title: "Longformer", meta: "Sparse attention for long docs", tags: ["AI"] } },
  { id: "a", position: { x: 1, y: 0 }, data: { kind: "agent", title: "Try sliding windows", meta: "Analyst", tags: [] } },
  { id: "x", type: "experiment", position: { x: 2, y: 0 }, data: { kind: "experiment", title: "Trial", meta: "Mock run on GLUE", tags: [], experiment: createExperiment({ ...DEFAULT_PARAMETERS, layers: 12 }) } },
  { id: "n", position: { x: 3, y: 0 }, data: { kind: "note", title: "Loose idea", meta: "", tags: [] } },
];
const edges = [{ id: "p-a", source: "p", target: "a" }, { id: "a-x", source: "a", target: "x" }];
// Feed is stored newest-first.
const log: AgentLogEntry[] = [
  { id: "2", agent: "literature", text: "Wants to add paper", time: "10:05", at: "2026-11-11T10:05:00.000Z", confidence: 0.8, gate: { type: "node", proposal: { kind: "paper", title: "BigBird", summary: "", tags: [] }, state: "approved" } },
  { id: "1", agent: "controller", text: "New goal received", time: "10:00", at: "2026-11-11T10:00:00.000Z" },
];

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } };
}

describe("research report", () => {
  it("lists each artifact's connections and flags unconnected items", () => {
    const r = buildResearchReport("Long context", nodes, edges, log);
    expect(r.sources[0]?.connections).toEqual({ linksTo: ["Try sliding windows"], linkedFrom: [] });
    expect(r.overview).toMatchObject({ artifacts: 4, relationships: 2, connectedArtifacts: 3, experiments: 1, agentLogEntries: 2 });
    expect(r.unconnected.map((u) => u.id)).toEqual(["n"]);
  });
  it("puts agent activity in chronological order with confidence and decisions", () => {
    const r = buildResearchReport("Long context", nodes, edges, log);
    expect(r.agentThoughts.activity.map((e) => e.agent)).toEqual(["Controller", "Literature Reviewer"]);
    expect(r.agentThoughts.activity[1]).toMatchObject({ confidence: 80, decision: { state: "approved", card: "BigBird" } });
    expect(r.agentThoughts.canvas[0]?.title).toBe("Try sliding windows");
  });
  it("includes experiment notes, predictions and deltas, labelled as mock", () => {
    const md = researchReportMarkdown(buildResearchReport("Long context", nodes, edges, log));
    expect(md).toContain("# Research Report: Long context");
    expect(md).toContain("not measured experiment results");
    expect(md).toContain("Predicted accuracy:** 85% (+3 pts vs baseline)");
    expect(md).toContain("Mock run on GLUE");
    expect(md).toContain("| Model layers | 12 | 6 |");
    expect(md).toContain("(80% confidence)");
    expect(md).toContain("- Longformer → Try sliding windows");
  });
});

describe("agent log memory", () => {
  it("survives a reload per workspace and keeps only the newest entries", () => {
    const s = memory();
    writeAgentLog(s, "u", "w1", Array.from({ length: AGENT_LOG_LIMIT + 5 }, (_, i) => ({ id: String(i), agent: "controller", text: `t${i}`, time: "" })));
    const back = readAgentLog(s, "u", "w1");
    expect(back).toHaveLength(AGENT_LOG_LIMIT);
    expect(back[0]?.id).toBe("0");
    expect(readAgentLog(s, "u", "w2")).toEqual([]);
    expect(listDirty(s, "u")).toEqual([]);
  });
});
