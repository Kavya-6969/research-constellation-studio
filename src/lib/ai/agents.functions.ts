import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Items = z.array(z.object({ id: z.string().max(64), kind: z.string().max(20), title: z.string().max(300), tags: z.array(z.string().max(40)).max(10) })).max(200);
const SPECIALISTS = ["literature", "environment", "experiment"] as const;

async function runStructured<T>(schema: z.ZodType<T>, instructions: string, content: string): Promise<{ out?: T; error?: string }> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return { error: "AI is not configured." };
  const { createOpenAI } = await import("@ai-sdk/openai");
  const { streamText, Output } = await import("ai");
  const provider = createOpenAI({ baseURL: "https://ai.gateway.lovable.dev/v1", apiKey, headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" } });
  try {
    const result = streamText({
      model: provider.responses("openai/gpt-6-astra"), maxRetries: 0, output: Output.object({ schema }), instructions,
      messages: [{ role: "user", content }],
      providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
    });
    return { out: await result.output };
  } catch (e: unknown) {
    const status = (e as { statusCode?: number })?.statusCode;
    console.error("agent call failed", status, e);
    if (status === 402) return { error: "AI credits have run out. Add credits to keep using the agents." };
    if (status === 429) return { error: "Too many requests right now. Please try again in a moment." };
    if (status === 403) return { error: "AI access is blocked for this workspace." };
    return { error: "The agent couldn't complete this task." };
  }
}

const ControllerSchema = z.object({
  thought: z.string(), confidence: z.number(),
  assignments: z.array(z.object({ agent: z.enum(SPECIALISTS), task: z.string() })),
});
export type ControllerResult = z.infer<typeof ControllerSchema> & { error?: string };

export const runController = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ goal: z.string().trim().min(5).max(2000), items: Items, available: z.array(z.enum(SPECIALISTS)) }).parse(d))
  .handler(async ({ data }): Promise<ControllerResult> => {
    const r = await runStructured(ControllerSchema,
      `You are the Controller of a research agent team. Route the user's goal to specialists. Available: ${data.available.join(", ")}. literature = finds and reviews papers/datasets; environment = proposes code repos, setup and tooling; experiment = designs and simulates experiments, predicts results. Give a one-sentence thought, a confidence 0-1, and 1-3 assignments (only available agents) each with a concrete one-sentence task.`,
      `Goal: ${data.goal}\n\nCanvas items:\n${JSON.stringify(data.items)}`);
    if (!r.out) return { thought: "", confidence: 0, assignments: [], error: r.error };
    return { ...r.out, confidence: Math.max(0, Math.min(1, r.out.confidence)), assignments: r.out.assignments.filter((a) => data.available.includes(a.agent)).slice(0, 3) };
  });

const AgentSchema = z.object({
  thought: z.string(), confidence: z.number(), steps: z.array(z.string()),
  proposals: z.array(z.object({ kind: z.enum(["paper", "dataset", "code", "note"]), title: z.string(), summary: z.string(), tags: z.array(z.string()), links: z.array(z.string()) })),
});
export type AgentResult = z.infer<typeof AgentSchema> & { error?: string };

const ROLE: Record<(typeof SPECIALISTS)[number], string> = {
  literature: "Literature Reviewer. Propose real, well-known papers or datasets (kind paper or dataset) with authors/year in the summary.",
  environment: "Environment / Code Setup Agent. Propose code repositories, libraries or setup notes (kind code or note).",
  experiment: "Experiment Simulation Agent. Design an experiment, simulate plausible expected results, and propose notes or datasets (kind note or dataset).",
};

export const runAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ agent: z.enum(SPECIALISTS), task: z.string().max(1000), goal: z.string().max(2000), items: Items }).parse(d))
  .handler(async ({ data }): Promise<AgentResult> => {
    const r = await runStructured(AgentSchema,
      `You are the ${ROLE[data.agent]} Return a one-sentence thought, confidence 0-1, 3-5 short steps you took, and 1-3 proposed canvas cards. Each card: short title (max 10 words), 1-2 sentence summary, up to 3 tags, and links = ids of existing canvas items it relates to (exact ids only).`,
      `Overall goal: ${data.goal}\nYour task: ${data.task}\n\nCanvas items:\n${JSON.stringify(data.items)}`);
    if (!r.out) return { thought: "", confidence: 0, steps: [], proposals: [], error: r.error };
    const ids = new Set(data.items.map((i) => i.id));
    return {
      ...r.out, confidence: Math.max(0, Math.min(1, r.out.confidence)), steps: r.out.steps.slice(0, 5),
      proposals: r.out.proposals.slice(0, 3).map((p) => ({ ...p, tags: p.tags.slice(0, 3), links: p.links.filter((l) => ids.has(l)).slice(0, 4) })),
    };
  });
