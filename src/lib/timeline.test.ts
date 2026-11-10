import { describe, expect, it } from "vitest";
import { appendEvents, diffCanvas, inferTimeline, replayTimeline, type TimelineNode } from "./timeline";

const node = (id: string, kind = "paper", extra: Partial<TimelineNode["data"]> = {}): TimelineNode =>
  ({ id, type: "artifact", position: { x: 0, y: 0 }, data: { kind, title: `T${id}`, ...extra } });
const T0 = "2026-11-10T10:00:00.000Z", T1 = "2026-11-10T10:01:00.000Z";

describe("timeline", () => {
  it("records added sources, links and agent nodes, ignoring moves", () => {
    const a = node("1"), b = node("literature-9", "paper");
    const prev = { nodes: [a], edges: [] };
    const next = { nodes: [{ ...a, position: { x: 50, y: 50 } }, b], edges: [{ id: "1-x", source: "1", target: "literature-9" }] };
    const events = diffCanvas(prev, next, T0);
    expect(events.map((e) => e.type)).toEqual(["node_added", "edge_added"]);
    expect(events[0]?.category).toBe("agent");
    expect(events[1]?.label).toBe("Linked T1 → Tliterature-9");
  });
  it("records experiment runs and merges rapid repeats of the same experiment", () => {
    const e1 = node("e", "experiment", { experiment: { metrics: { accuracy: 82 } } });
    const e2 = node("e", "experiment", { experiment: { metrics: { accuracy: 85 } } });
    const first = diffCanvas({ nodes: [e1], edges: [] }, { nodes: [e2], edges: [] }, T0);
    expect(first[0]?.label).toBe("Experiment run: Te → 85.00% predicted");
    const e3 = node("e", "experiment", { experiment: { metrics: { accuracy: 86 } } });
    const merged = appendEvents(first, diffCanvas({ nodes: [e2], edges: [] }, { nodes: [e3], edges: [] }, T1));
    expect(merged).toHaveLength(1);
    const m = merged[0];
    expect(m?.type === "experiment_run" && m.experiment).toEqual({ metrics: { accuracy: 86 } });
  });
  it("replays the map step by step, including removals", () => {
    const timeline = [
      ...diffCanvas(null, { nodes: [node("1"), node("2")], edges: [] }, T0),
      ...diffCanvas({ nodes: [node("1"), node("2")], edges: [] }, { nodes: [node("1"), node("2")], edges: [{ id: "1-2", source: "1", target: "2" }] }, T0),
      ...diffCanvas({ nodes: [node("1"), node("2")], edges: [{ id: "1-2", source: "1", target: "2" }] }, { nodes: [node("1")], edges: [] }, T1),
    ];
    expect(replayTimeline(timeline, 0).nodes.map((n) => n.id)).toEqual(["1"]);
    expect(replayTimeline(timeline, 2).edges).toHaveLength(1);
    const end = replayTimeline(timeline, timeline.length - 1);
    expect(end.nodes.map((n) => n.id)).toEqual(["1"]);
    expect(end.edges).toHaveLength(0);
  });
  it("infers an ordered history for maps created before recording, links after both ends exist", () => {
    const events = inferTimeline({ nodes: [node("1"), node("2")], edges: [{ id: "1-2", source: "1", target: "2" }] }, T0);
    expect(events.map((e) => e.type)).toEqual(["node_added", "node_added", "edge_added"]);
  });
  it("caps history length to the newest events", () => {
    const events = diffCanvas(null, { nodes: ["1", "2", "3"].map((id) => node(id)), edges: [] }, T0);
    expect(appendEvents([], events, 2).map((e) => e.type === "node_added" && e.node.id)).toEqual(["2", "3"]);
  });
});
