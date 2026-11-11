// Pure, browser-safe compiler that turns a workspace into a structured research report.
import { buildWorkspaceExport } from "./workspace-export";
import { experimentDeltas } from "./experiments";
import type { AgentLogEntry } from "./agent-log";
import type { TimelineEvent } from "./timeline";

type Input = Parameters<typeof buildWorkspaceExport>;
const AGENT_NAMES: Record<string, string> = { controller: "Controller", literature: "Literature Reviewer", environment: "Env / Code Setup", experiment: "Experiment Sim" };
const SOURCE_KINDS = ["paper", "dataset", "code"];
const KIND_LABEL: Record<string, string> = { paper: "Paper", dataset: "Dataset", code: "Code", note: "Note", agent: "Agent thought", experiment: "Experiment" };

export function buildResearchReport(name: string, nodes: Input[1], edges: Input[2], agentLog: AgentLogEntry[] = [], timeline: TimelineEvent[] = []) {
  const base = buildWorkspaceExport(name, nodes, edges);
  const title = new Map(base.nodes.map((n) => [n.id, n.data.title]));
  const relationships = base.relationships
    .filter((e) => title.has(e.source) && title.has(e.target))
    .map((e) => ({ id: e.id, source: e.source, target: e.target, sourceTitle: title.get(e.source) ?? e.source, targetTitle: title.get(e.target) ?? e.target }));
  const artifacts = base.nodes.map((n) => ({
    id: n.id, kind: n.data.kind, title: n.data.title, summary: n.data.meta, tags: n.data.tags, position: n.position,
    connections: {
      linksTo: relationships.filter((r) => r.source === n.id).map((r) => r.targetTitle),
      linkedFrom: relationships.filter((r) => r.target === n.id).map((r) => r.sourceTitle),
    },
  }));
  const isConnected = (a: (typeof artifacts)[number]) => a.connections.linksTo.length + a.connections.linkedFrom.length > 0;
  const experiments = base.nodes.filter((n) => n.data.experiment).map((n) => {
    const x = n.data.experiment!;
    return { id: n.id, title: n.data.title, notes: n.data.meta, parameters: x.parameters, baseline: x.baseline, predicted: x.metrics, deltas: experimentDeltas(x),
      connections: artifacts.find((a) => a.id === n.id)!.connections };
  });
  const activity = [...agentLog].reverse().map((e) => ({
    at: e.at ?? null, time: e.time, agent: AGENT_NAMES[e.agent] ?? e.agent, text: e.text,
    confidence: typeof e.confidence === "number" ? Math.round(e.confidence * 100) : null, steps: e.steps ?? [],
    decision: e.gate ? { kind: e.gate.type === "task" ? "task" : "card", state: e.gate.state, ...(e.gate.type === "node" ? { card: e.gate.proposal.title } : { task: e.gate.task }) } : null,
  }));
  const byKind = Object.fromEntries(Object.keys(KIND_LABEL).map((k) => [k, artifacts.filter((a) => a.kind === k).length]));
  return {
    schemaVersion: 1, type: "research-report" as const, name, generatedAt: base.exportedAt, simulation: base.simulation,
    overview: { artifacts: artifacts.length, relationships: relationships.length, connectedArtifacts: artifacts.filter(isConnected).length, experiments: experiments.length, agentLogEntries: activity.length, byKind },
    sources: artifacts.filter((a) => SOURCE_KINDS.includes(a.kind)),
    notes: artifacts.filter((a) => a.kind === "note"),
    agentThoughts: { canvas: artifacts.filter((a) => a.kind === "agent"), activity },
    experiments, relationships,
    unconnected: artifacts.filter((a) => !isConnected(a)).map((a) => ({ id: a.id, kind: a.kind, title: a.title })),
    history: timeline.slice(-50).map((e) => ({ at: e.at, event: e.label })),
  };
}

export type ResearchReport = ReturnType<typeof buildResearchReport>;
const esc = (s: string) => s.replace(/[\\`*_{}\[\]<>#|]/g, "\\$&").replace(/\r?\n/g, " ");
const list = (xs: string[]) => xs.length ? xs.map(esc).join(", ") : "—";

export function researchReportMarkdown(r: ResearchReport): string {
  const o = r.overview;
  const out: string[] = [
    `# Research Report: ${esc(r.name)}`,
    `_Generated ${r.generatedAt}_`,
    `> ${r.simulation}`,
    "## Overview",
    [`- **Artifacts:** ${o.artifacts} (${Object.entries(o.byKind).filter(([, n]) => n).map(([k, n]) => `${n} ${KIND_LABEL[k]?.toLowerCase() ?? k}`).join(", ") || "none"})`,
      `- **Relationships:** ${o.relationships} · **Connected artifacts:** ${o.connectedArtifacts}`,
      `- **Experiments:** ${o.experiments} · **Agent log entries:** ${o.agentLogEntries}`].join("\n"),
  ];
  const artifact = (a: ResearchReport["sources"][number]) => [
    `### ${esc(a.title)}`,
    `_${KIND_LABEL[a.kind] ?? a.kind}${a.tags.length ? ` · ${a.tags.map((t) => `#${esc(t)}`).join(" ")}` : ""}_`,
    a.summary ? esc(a.summary) : "_No summary._",
    `- **Links to:** ${list(a.connections.linksTo)}\n- **Linked from:** ${list(a.connections.linkedFrom)}`,
  ].join("\n\n");
  out.push("## Sources & summaries", r.sources.length ? r.sources.map(artifact).join("\n\n") : "_No sources yet._");
  out.push("## Notes", r.notes.length ? r.notes.map(artifact).join("\n\n") : "_No notes yet._");
  out.push("## Agent thoughts");
  if (r.agentThoughts.canvas.length) out.push(r.agentThoughts.canvas.map(artifact).join("\n\n"));
  out.push("### Activity log");
  out.push(r.agentThoughts.activity.length ? r.agentThoughts.activity.map((e) => {
    const head = `- **${e.at ? e.at.slice(0, 16).replace("T", " ") : e.time} · ${esc(e.agent)}**${e.confidence !== null ? ` (${e.confidence}% confidence)` : ""}: ${esc(e.text)}`;
    const steps = e.steps.map((s, i) => `  ${i + 1}. ${esc(s)}`);
    const decision = e.decision ? [`  - Decision: **${e.decision.state}** (${e.decision.kind})`] : [];
    return [head, ...steps, ...decision].join("\n");
  }).join("\n") : "_No agent activity recorded._");
  out.push("## Experiments");
  out.push(r.experiments.length ? r.experiments.map((x) => [
    `### ${esc(x.title)}`,
    "| Parameter | Current | Baseline |\n| --- | --- | --- |\n" +
      `| Learning rate | ${x.parameters.learningRate} | ${x.baseline.learningRate} |\n| Batch size | ${x.parameters.batchSize} | ${x.baseline.batchSize} |\n| Model layers | ${x.parameters.layers} | ${x.baseline.layers} |`,
    `- **Predicted accuracy:** ${x.predicted.accuracy}% (${x.deltas.accuracy >= 0 ? "+" : ""}${x.deltas.accuracy} pts vs baseline)\n- **Predicted latency:** ${x.predicted.latencyMs} ms (${x.deltas.latencyMs >= 0 ? "+" : ""}${x.deltas.latencyMs} ms vs baseline)\n- **Notes:** ${esc(x.notes)}\n- **Links to:** ${list(x.connections.linksTo)} · **Linked from:** ${list(x.connections.linkedFrom)}`,
  ].join("\n\n")).join("\n\n") : "_No experiments yet._");
  out.push("## Relationships", r.relationships.length ? r.relationships.map((e) => `- ${esc(e.sourceTitle)} → ${esc(e.targetTitle)}`).join("\n") : "_No relationships yet._");
  if (r.unconnected.length) out.push("## Unconnected items", r.unconnected.map((a) => `- ${esc(a.title)} (${KIND_LABEL[a.kind] ?? a.kind})`).join("\n"));
  if (r.history.length) out.push("## Map history (latest)", r.history.map((h) => `- ${h.at.slice(0, 16).replace("T", " ")}: ${esc(h.event)}`).join("\n"));
  return out.join("\n\n") + "\n";
}
