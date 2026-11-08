import { describe, expect, it } from "vitest";
import { createExperiment, DEFAULT_PARAMETERS, experimentDeltas, simulateExperiment } from "./experiments";
import { buildWorkspaceExport, workspaceMarkdown } from "./workspace-export";

describe("mock experiments", () => {
  it("starts at a stable baseline with no deltas", () => {
    const experiment = createExperiment();
    expect(experiment.metrics).toEqual({ accuracy: 82, latencyMs: 120 });
    expect(experimentDeltas(experiment)).toEqual({ accuracy: 0, latencyMs: 0 });
  });
  it("predicts accuracy and latency changes when layers change", () => {
    const experiment = createExperiment({ ...DEFAULT_PARAMETERS, layers: 12 });
    expect(experiment.metrics).toEqual({ accuracy: 85, latencyMs: 240 });
    expect(experimentDeltas(experiment)).toEqual({ accuracy: 3, latencyMs: 120 });
  });
  it("reacts to learning rate and batch size", () => {
    expect(simulateExperiment({ ...DEFAULT_PARAMETERS, learningRate: 0.01 }).accuracy).toBe(79.5);
    expect(simulateExperiment({ ...DEFAULT_PARAMETERS, batchSize: 128 })).toEqual({ accuracy: 80.8, latencyMs: 162 });
  });
  it("keeps invalid parameter input finite and within supported bounds", () => {
    const experiment = createExperiment({ learningRate: NaN, batchSize: 900, layers: -2 });
    expect(experiment.parameters).toEqual({ learningRate: 0.001, batchSize: 256, layers: 1 });
    expect(Number.isFinite(experiment.metrics.accuracy)).toBe(true);
  });
  it("can reset deltas by adopting current parameters as baseline", () => {
    const p = { ...DEFAULT_PARAMETERS, layers: 12 };
    expect(experimentDeltas(createExperiment(p, p))).toEqual({ accuracy: 0, latencyMs: 0 });
  });
});
describe("workspace exports", () => {
  it("preserves notes, layout, relationships, and experiment summaries in both formats", () => {
    const workspace = buildWorkspaceExport("Research", [
      { id: "note", position: { x: 12, y: 34 }, data: { kind: "note", title: "Plan", meta: "Compare models", tags: ["AI"] } },
      { id: "experiment", type: "experiment", position: { x: 360, y: 0 }, data: { kind: "experiment", title: "Trial", meta: "Mock", tags: [], experiment: createExperiment({ ...DEFAULT_PARAMETERS, layers: 12 }) } },
    ], [{ id: "link", source: "note", target: "experiment" }]);
    const parsed = JSON.parse(JSON.stringify(workspace));
    expect(parsed.nodes[0].data.meta).toBe("Compare models");
    expect(parsed.nodes[0].position).toEqual({ x: 12, y: 34 });
    expect(parsed.relationships[0]).toMatchObject({ source: "note", target: "experiment" });
    expect(parsed.nodes[1].data.experiment.metrics).toEqual({ accuracy: 85, latencyMs: 240 });
    const markdown = workspaceMarkdown(workspace);
    expect(markdown).toContain("Compare models");
    expect(markdown).toContain("Plan (note) → Trial (experiment)");
    expect(markdown).toContain("Predicted accuracy: 85%");
    expect(markdown).toContain("Model layers: 12");
  });
});