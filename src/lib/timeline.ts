// Pure, browser-safe helpers that record and replay how a research canvas evolved.
export type TimelineNode = {
  id: string; type?: string | undefined; position: { x: number; y: number };
  data: { kind: string; title: string; meta?: string; tags?: string[]; experiment?: { metrics?: { accuracy?: number; latencyMs?: number } } & Record<string, unknown> } & Record<string, unknown>;
};
export type TimelineEdge = { id: string; source: string; target: string } & Record<string, unknown>;
export type Category = "source" | "agent" | "experiment" | "note" | "link" | "remove";

type Base = { id: string; at: string; label: string; category: Category };
export type TimelineEvent =
  | (Base & { type: "node_added"; node: TimelineNode })
  | (Base & { type: "node_removed"; nodeId: string })
  | (Base & { type: "edge_added"; edge: TimelineEdge })
  | (Base & { type: "edge_removed"; edgeId: string })
  | (Base & { type: "experiment_run"; nodeId: string; experiment: Record<string, unknown> });

export type Canvas = { nodes: TimelineNode[]; edges: TimelineEdge[] };
export const TIMELINE_LIMIT = 400;
const AGENT_PREFIXES = ["controller-", "literature-", "environment-", "experiment-"];

const categoryOf = (node: TimelineNode): Category => {
  if (node.data.kind === "experiment") return "experiment";
  if (node.data.kind === "agent" || AGENT_PREFIXES.some((p) => node.id.startsWith(p))) return "agent";
  if (node.data.kind === "note") return "note";
  return "source";
};
const addedLabel = (node: TimelineNode) => {
  const c = categoryOf(node);
  if (c === "experiment") return `Experiment created: ${node.data.title}`;
  if (c === "agent") return `Agent added: ${node.data.title}`;
  if (c === "note") return `Note added: ${node.data.title}`;
  return `Source added: ${node.data.title}`;
};
const titleOf = (nodes: TimelineNode[], id: string) => nodes.find((n) => n.id === id)?.data.title ?? id;
const expKey = (n: TimelineNode) => JSON.stringify(n.data.experiment ?? null);

/** Compare two saved canvas states and describe what changed. Pure moves are ignored. */
export function diffCanvas(prev: Canvas | null, next: Canvas, at: string): TimelineEvent[] {
  const before = prev ?? { nodes: [], edges: [] };
  const stamp = Date.parse(at) || 0;
  const out: TimelineEvent[] = [];
  const id = (kind: string, key: string) => `${stamp}-${kind}-${key}`;
  const prevNodes = new Map(before.nodes.map((n) => [n.id, n]));
  const nextNodes = new Map(next.nodes.map((n) => [n.id, n]));
  const allNodes = [...before.nodes, ...next.nodes];

  for (const node of next.nodes) {
    const old = prevNodes.get(node.id);
    if (!old) out.push({ id: id("node", node.id), at, type: "node_added", node, label: addedLabel(node), category: categoryOf(node) });
    else if (node.data.kind === "experiment" && expKey(old) !== expKey(node) && node.data.experiment) {
      const acc = node.data.experiment.metrics?.accuracy;
      out.push({ id: id("exp", node.id), at, type: "experiment_run", nodeId: node.id, experiment: node.data.experiment,
        label: `Experiment run: ${node.data.title}${typeof acc === "number" ? ` → ${acc.toFixed(2)}% predicted` : ""}`, category: "experiment" });
    }
  }
  const prevEdges = new Set(before.edges.map((e) => e.id));
  const nextEdges = new Set(next.edges.map((e) => e.id));
  for (const edge of next.edges) if (!prevEdges.has(edge.id))
    out.push({ id: id("edge", edge.id), at, type: "edge_added", edge, label: `Linked ${titleOf(allNodes, edge.source)} → ${titleOf(allNodes, edge.target)}`, category: "link" });
  for (const edge of before.edges) if (!nextEdges.has(edge.id))
    out.push({ id: id("unlink", edge.id), at, type: "edge_removed", edgeId: edge.id, label: `Unlinked ${titleOf(allNodes, edge.source)} → ${titleOf(allNodes, edge.target)}`, category: "remove" });
  for (const node of before.nodes) if (!nextNodes.has(node.id))
    out.push({ id: id("remove", node.id), at, type: "node_removed", nodeId: node.id, label: `Removed: ${node.data.title}`, category: "remove" });
  return out;
}

/** Infer an ordered history for a map that existed before the timeline was recorded. */
export function inferTimeline(canvas: Canvas, at: string): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  const placed: TimelineNode[] = [];
  const pending = [...canvas.edges];
  for (const node of canvas.nodes) {
    placed.push(node);
    out.push(...diffCanvas({ nodes: placed.slice(0, -1), edges: [] }, { nodes: [node], edges: [] }, at).filter((e) => e.type === "node_added"));
    for (let i = pending.length - 1; i >= 0; i--) {
      const edge = pending[i];
      if (edge && placed.some((n) => n.id === edge.source) && placed.some((n) => n.id === edge.target)) {
        pending.splice(i, 1);
        out.push({ id: `${Date.parse(at) || 0}-edge-${edge.id}`, at, type: "edge_added", edge, label: `Linked ${titleOf(placed, edge.source)} → ${titleOf(placed, edge.target)}`, category: "link" });
      }
    }
  }
  return out;
}

/** Append new events, merging rapid repeated runs of the same experiment and capping history length. */
export function appendEvents(timeline: TimelineEvent[], events: TimelineEvent[], limit = TIMELINE_LIMIT): TimelineEvent[] {
  const out = [...timeline];
  for (const ev of events) {
    const last = out[out.length - 1];
    if (ev.type === "experiment_run" && last?.type === "experiment_run" && last.nodeId === ev.nodeId && Date.parse(ev.at) - Date.parse(last.at) < 120_000) {
      out[out.length - 1] = { ...ev, id: last.id };
    } else out.push(ev);
  }
  return out.length > limit ? out.slice(out.length - limit) : out;
}

/** Rebuild the canvas as it looked right after event `index` (inclusive). */
export function replayTimeline(timeline: TimelineEvent[], index: number): Canvas {
  const nodes = new Map<string, TimelineNode>();
  const edges = new Map<string, TimelineEdge>();
  const last = Math.min(index, timeline.length - 1);
  for (let i = 0; i <= last; i++) {
    const ev = timeline[i];
    if (!ev) continue;
    if (ev.type === "node_added") nodes.set(ev.node.id, ev.node);
    else if (ev.type === "node_removed") {
      nodes.delete(ev.nodeId);
      for (const [k, e] of edges) if (e.source === ev.nodeId || e.target === ev.nodeId) edges.delete(k);
    } else if (ev.type === "edge_added") edges.set(ev.edge.id, ev.edge);
    else if (ev.type === "edge_removed") edges.delete(ev.edgeId);
    else if (ev.type === "experiment_run") {
      const node = nodes.get(ev.nodeId);
      if (node) nodes.set(node.id, { ...node, data: { ...node.data, experiment: ev.experiment } });
    }
  }
  const ns = [...nodes.values()];
  return { nodes: ns, edges: [...edges.values()].filter((e) => nodes.has(e.source) && nodes.has(e.target)) };
}

/** The node or edge an event touched, for highlighting during replay. */
export function touchedBy(ev: TimelineEvent | undefined): { nodeId?: string; edgeId?: string } {
  if (!ev) return {};
  if (ev.type === "node_added") return { nodeId: ev.node.id };
  if (ev.type === "experiment_run") return { nodeId: ev.nodeId };
  if (ev.type === "edge_added") return { edgeId: ev.edge.id };
  return {};
}

export function parseTimeline(value: unknown): TimelineEvent[] {
  return Array.isArray(value) ? value.filter((e): e is TimelineEvent => !!e && typeof e === "object" && typeof (e as TimelineEvent).type === "string" && typeof (e as TimelineEvent).at === "string") : [];
}
