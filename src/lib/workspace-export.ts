import { createExperiment, experimentDeltas, type Experiment } from "./experiments";

type ExportNode = { id: string; type?: string; position: { x: number; y: number }; data: { kind: string; title: string; meta: string; tags: string[]; experiment?: Experiment } };
type ExportEdge = { id: string; source: string; target: string; type?: string; animated?: boolean; sourceHandle?: string | null; targetHandle?: string | null };
export function buildWorkspaceExport(name: string, nodes: ExportNode[], edges: ExportEdge[]) {
  return {
    schemaVersion: 1, name, exportedAt: new Date().toISOString(),
    simulation: "Illustrative mock predictions; not measured experiment results.",
    nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position, data: {
      kind: data.kind, title: data.title, meta: data.meta, tags: data.tags,
      ...(data.kind === "experiment" ? { experiment: createExperiment(data.experiment?.parameters, data.experiment?.baseline) } : {}),
    } })),
    relationships: edges.map(({ id, source, target, type, animated, sourceHandle, targetHandle }) => ({ id, source, target, type, animated, sourceHandle, targetHandle })),
  };
}
export function workspaceMarkdown(workspace: ReturnType<typeof buildWorkspaceExport>) {
  const escape = (s: string) => s.replace(/[\\`*_{}\[\]<>#|]/g, "\\$&").replace(/\r?\n/g, " ");
  const sections = [`# ${escape(workspace.name)}`, `Exported: ${workspace.exportedAt}`, `> ${workspace.simulation}`, "## Artifacts"];
  for (const node of workspace.nodes) {
    sections.push(`### ${escape(node.data.title)}`, `- ID: ${escape(node.id)}\n- Type: ${node.data.kind}\n- Tags: ${node.data.tags.map(escape).join(", ")}\n- Position: (${node.position.x}, ${node.position.y})`, node.data.meta);
    const experiment = node.data.experiment;
    if (experiment) {
      const p = experiment.parameters, b = experiment.baseline, delta = experimentDeltas(experiment);
      sections.push(`#### Experiment summary\n- Learning rate: ${p.learningRate}\n- Batch size: ${p.batchSize}\n- Model layers: ${p.layers}\n- Predicted accuracy: ${experiment.metrics.accuracy}%\n- Predicted latency: ${experiment.metrics.latencyMs} ms\n- Accuracy delta: ${delta.accuracy} percentage points\n- Latency delta: ${delta.latencyMs} ms\n- Baseline: learning rate ${b.learningRate}, batch size ${b.batchSize}, layers ${b.layers}`);
    }
  }
  sections.push("## Relationships");
  for (const edge of workspace.relationships) {
    const source = workspace.nodes.find((n) => n.id === edge.source)?.data.title ?? edge.source;
    const target = workspace.nodes.find((n) => n.id === edge.target)?.data.title ?? edge.target;
    sections.push(`- ${escape(source)} (${escape(edge.source)}) → ${escape(target)} (${escape(edge.target)})`);
  }
  return sections.join("\n\n") + "\n";
}
export function downloadWorkspace(content: string, name: string, format: "json" | "md") {
  const blob = new Blob([content], { type: format === "json" ? "application/json;charset=utf-8" : "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^a-z0-9_-]/gi, "-").slice(0, 80) || "workspace"}.${format}`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}