import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  kind: z.enum(["paper", "code"]),
  text: z.string().trim().min(20).max(8000),
  items: z.array(z.object({ id: z.string().max(64), kind: z.string().max(20), title: z.string().max(300), tags: z.array(z.string().max(40)).max(10) })).max(200),
});

export type AnalyzeResult = {
  title: string; summary: string; tags: string[];
  connections: { id: string; reason: string }[];
  error?: string;
};

export const analyzeSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<AnalyzeResult> => {
    const empty = { title: "", summary: "", tags: [], connections: [] };
    const apiKey = process.env['LOVABLE_API_KEY'];
    if (!apiKey) return { ...empty, error: "AI is not configured." };
    const { createOpenAI } = await import("@ai-sdk/openai");
    const { streamText, Output } = await import("ai");
    const provider = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1", apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });
    const schema = z.object({
      title: z.string(), summary: z.string(), tags: z.array(z.string()),
      connections: z.array(z.object({ id: z.string(), reason: z.string() })),
    });
    try {
      const result = streamText({
        model: provider.responses("openai/gpt-6-astra"),
        maxRetries: 0,
        output: Output.object({ schema }),
        instructions: "You are a research assistant. Given a paper abstract or code description and a list of existing canvas items, return: a short title (max 10 words), a concise 2-3 sentence summary, up to 3 short tags, and up to 5 connections to existing items (use their exact id) with a one-sentence reason each. Only suggest genuinely related items.",
        messages: [{ role: "user", content: `Type: ${data.kind}\n\nInput:\n${data.text}\n\nCanvas items:\n${JSON.stringify(data.items)}` }],
        providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
      });
      const out = await result.output;
      const ids = new Set(data.items.map((i) => i.id));
      return { ...out, tags: out.tags.slice(0, 3), connections: out.connections.filter((c) => ids.has(c.id)).slice(0, 5) };
    } catch (e: unknown) {
      const status = (e as { statusCode?: number })?.statusCode;
      console.error("analyzeSource failed", status, e);
      if (status === 402) return { ...empty, error: "AI credits have run out. Add credits to keep using AI analysis." };
      if (status === 429) return { ...empty, error: "Too many requests right now. Please try again in a moment." };
      if (status === 403) return { ...empty, error: "AI access is blocked for this workspace." };
      return { ...empty, error: "The AI couldn't analyze this input. Please try again." };
    }
  });
