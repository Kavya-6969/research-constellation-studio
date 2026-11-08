export type Parameters = { learningRate: number; batchSize: number; layers: number };
export type Metrics = { accuracy: number; latencyMs: number };
export type Experiment = { parameters: Parameters; baseline: Parameters; metrics: Metrics; simulationVersion: 1 };
export const DEFAULT_PARAMETERS: Parameters = { learningRate: 0.001, batchSize: 32, layers: 6 };
export const PARAMETER_LIMITS = {
  learningRate: { min: 0.00001, max: 0.1 },
  batchSize: { min: 1, max: 256 },
  layers: { min: 1, max: 24 },
};
export function normalizeParameters(p: Parameters): Parameters {
  const bound = (key: keyof Parameters, integer = false) => {
    const value = Number.isFinite(p[key]) ? p[key] : DEFAULT_PARAMETERS[key];
    const clamped = Math.max(PARAMETER_LIMITS[key].min, Math.min(PARAMETER_LIMITS[key].max, value));
    return integer ? Math.round(clamped) : clamped;
  };
  return { learningRate: bound("learningRate"), batchSize: bound("batchSize", true), layers: bound("layers", true) };
}
// Deterministic illustrative model, not measured or AI-inferred performance.
export function simulateExperiment(input: Parameters): Metrics {
  const p = normalizeParameters(input);
  const accuracy = 82 + 3 * Math.log2(p.layers / 6) - 2.5 * Math.log10(p.learningRate / 0.001) ** 2 - 0.6 * Math.abs(Math.log2(p.batchSize / 32));
  const latencyMs = 120 * (p.layers / 6) * (0.65 + 0.35 * Math.sqrt(p.batchSize / 32));
  return { accuracy: Math.round(Math.max(0, Math.min(100, accuracy)) * 100) / 100, latencyMs: Math.round(latencyMs * 100) / 100 };
}
export function createExperiment(parameters = DEFAULT_PARAMETERS, baseline = DEFAULT_PARAMETERS): Experiment {
  const normalized = normalizeParameters(parameters);
  return { parameters: normalized, baseline: normalizeParameters(baseline), metrics: simulateExperiment(normalized), simulationVersion: 1 };
}
export function experimentDeltas(experiment: Experiment) {
  const baseline = simulateExperiment(experiment.baseline);
  const metrics = simulateExperiment(experiment.parameters);
  return { accuracy: Math.round((metrics.accuracy - baseline.accuracy) * 100) / 100, latencyMs: Math.round((metrics.latencyMs - baseline.latencyMs) * 100) / 100 };
}