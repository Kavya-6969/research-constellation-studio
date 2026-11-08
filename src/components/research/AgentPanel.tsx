import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Brain, Check, X, Loader2, Send, BookOpen, Wrench, FlaskConical, Network, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { runController, runAgent } from "@/lib/ai/agents.functions";
import { applyOutcome, reinstate, START_SCORE, RETIRE_AT, type AgentId, type AgentState, type AgentStatus } from "@/lib/agents/scoring";

type Specialist = Exclude<AgentId, "controller">;
export type Proposal = { kind: "paper" | "dataset" | "code" | "note"; title: string; summary: string; tags: string[]; links: string[] };
type Item = { id: string; kind: string; title: string; tags: string[] };
type Feed = {
  id: string; agent: AgentId; text: string; time: string; confidence?: number; steps?: string[];
  gate?: { type: "task"; task: string; target: Specialist; state: "pending" | "approved" | "rejected" }
       | { type: "node"; proposal: Proposal; state: "pending" | "approved" | "rejected" };
};

const META: Record<AgentId, { name: string; icon: typeof Brain }> = {
  controller: { name: "Controller", icon: Network },
  literature: { name: "Literature Reviewer", icon: BookOpen },
  environment: { name: "Env / Code Setup", icon: Wrench },
  experiment: { name: "Experiment Sim", icon: FlaskConical },
};
const STATUS: Record<AgentStatus, { label: string; cls: string }> = {
  idle: { label: "Idle", cls: "text-muted-foreground" },
  running: { label: "Running", cls: "text-primary" },
  waiting: { label: "Waiting for Approval", cls: "text-node-note" },
  complete: { label: "Complete", cls: "text-success" },
  retired: { label: "Retired", cls: "text-destructive" },
};
const STORE = "glimpse.agents.v1";
const fresh = (): Record<AgentId, AgentState> => Object.fromEntries((Object.keys(META) as AgentId[]).map((id) =>
  [id, { id, name: META[id].name, status: "idle", score: START_SCORE, successes: 0, failures: 0, step: "" }])) as Record<AgentId, AgentState>;
const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const uid = () => Math.random().toString(36).slice(2);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function AgentPanel({ items, onSpawn }: { items: Item[]; onSpawn: (p: Proposal, agent: AgentId) => void }) {
  const [agents, setAgents] = useState(fresh);
  const [feed, setFeed] = useState<Feed[]>([]);
  const [goal, setGoal] = useState("");
  const [goalCtx, setGoalCtx] = useState("");
  const controllerFn = useServerFn(runController);
  const agentFn = useServerFn(runAgent);

  useEffect(() => { try { const s = localStorage.getItem(STORE); if (s) setAgents({ ...fresh(), ...JSON.parse(s) }); } catch { /* ignore */ } }, []);
  useEffect(() => { localStorage.setItem(STORE, JSON.stringify(agents)); }, [agents]);

  const patch = (id: AgentId, p: Partial<AgentState>) => setAgents((a) => ({ ...a, [id]: { ...a[id], ...p } }));
  const score = (id: AgentId, o: "approved" | "rejected" | "failed") => setAgents((a) => {
    const next = applyOutcome(a[id], o);
    if (next.status === "retired" && a[id].status !== "retired") toast.error(`${a[id].name} was retired for low score.`);
    return { ...a, [id]: next };
  });
  const push = (f: Omit<Feed, "id" | "time">) => setFeed((x) => [{ ...f, id: uid(), time: now() }, ...x]);
  const setGate = (id: string, state: "approved" | "rejected") => setFeed((x) => x.map((f) => f.id === id && f.gate ? { ...f, gate: { ...f.gate, state } } as Feed : f));

  const submit = async () => {
    const g = goal.trim(); if (g.length < 5) return;
    const available = (["literature", "environment", "experiment"] as Specialist[]).filter((id) => agents[id].status !== "retired");
    if (!available.length) { toast.error("All specialists are retired. Reinstate one first."); return; }
    setGoal(""); setGoalCtx(g);
    patch("controller", { status: "running", step: "Routing goal to specialists…" });
    push({ agent: "controller", text: `New goal received: “${g}”` });
    const r = await controllerFn({ data: { goal: g, items, available } });
    if (r.error || !r.assignments.length) {
      score("controller", "failed"); patch("controller", { status: "idle", step: "" });
      push({ agent: "controller", text: r.error ?? "Couldn't find a specialist for this goal." }); return;
    }
    push({ agent: "controller", text: r.thought, confidence: r.confidence });
    for (const a of r.assignments) {
      push({ agent: "controller", text: `Wants to assign ${META[a.agent].name}: ${a.task}`, gate: { type: "task", task: a.task, target: a.agent, state: "pending" } });
      patch(a.agent, { status: "waiting", step: "Waiting for task approval" });
    }
    patch("controller", { status: "complete", step: "" });
  };

  const runTask = async (f: Feed, target: Specialist, task: string) => {
    patch(target, { status: "running", step: "Thinking…" });
    const r = await agentFn({ data: { agent: target, task, goal: goalCtx, items } });
    if (r.error || !r.proposals.length) {
      score(target, "failed"); setAgents((a) => a[target].status === "retired" ? a : { ...a, [target]: { ...a[target], status: "idle", step: "" } });
      push({ agent: target, text: r.error ?? "Task failed: no useful results." }); return;
    }
    for (const s of r.steps) { patch(target, { step: s }); await wait(500); }
    push({ agent: target, text: r.thought, confidence: r.confidence, steps: r.steps });
    for (const p of r.proposals) push({ agent: target, text: `Wants to add ${p.kind}: “${p.title}”`, confidence: r.confidence, gate: { type: "node", proposal: p, state: "pending" } });
    patch(target, { status: "waiting", step: `${r.proposals.length} card(s) awaiting approval` });
    void f;
  };

  // Mark an agent complete once nothing of theirs is pending
  useEffect(() => {
    (Object.keys(agents) as AgentId[]).forEach((id) => {
      const a = agents[id];
      if (a.status === "waiting" && !feed.some((f) => f.gate?.state === "pending" && (f.agent === id || (f.gate.type === "task" && f.gate.target === id))))
        patch(id, { status: "complete", step: "" });
    });
  }, [feed]); // eslint-disable-line react-hooks/exhaustive-deps

  const decide = (f: Feed, ok: boolean) => {
    if (!f.gate) return;
    setGate(f.id, ok ? "approved" : "rejected");
    if (f.gate.type === "task") { if (ok) void runTask(f, f.gate.target, f.gate.task); return; }
    if (ok) onSpawn(f.gate.proposal, f.agent);
    score(f.agent, ok ? "approved" : "rejected");
  };

  const pending = feed.filter((f) => f.gate?.state === "pending").length;
  const active = Object.values(agents).filter((a) => a.status === "running");

  return (
    <div className="flex min-h-0 w-80 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div><p className="text-sm font-semibold">Agent Activity</p><p className="text-[11px] text-muted-foreground">Controller · live feed</p></div>
        {pending > 0 && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">{pending} awaiting</span>}
      </div>
      <div className="space-y-1.5 border-b border-border p-3">
        {Object.values(agents).map((a) => {
          const I = META[a.id].icon; const st = STATUS[a.status];
          return (
            <div key={a.id} className="rounded-md border border-border bg-background/50 px-2.5 py-2">
              <div className="flex items-center gap-2">
                <I className={cn("h-3.5 w-3.5 shrink-0", a.status === "retired" ? "text-destructive" : "text-node-agent")} />
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{a.name}</span>
                <span className={cn("rounded px-1.5 py-0.5 font-mono text-[10px]", a.score > 60 ? "bg-success/15 text-success" : a.score > RETIRE_AT ? "bg-secondary text-muted-foreground" : "bg-destructive/15 text-destructive")} title={`${a.successes} successes · ${a.failures} failures`}>{a.score}</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 pl-5.5 text-[10px]">
                {a.status === "running" && <Loader2 className="h-2.5 w-2.5 animate-spin text-primary" />}
                <span className={st.cls}>{st.label}</span>
                {a.step && <span className="truncate text-muted-foreground">· {a.step}</span>}
                {a.status === "retired" && <button onClick={() => setAgents((x) => ({ ...x, [a.id]: reinstate(a) }))} className="ml-auto flex items-center gap-1 text-muted-foreground hover:text-foreground"><RotateCcw className="h-2.5 w-2.5" />Reinstate</button>}
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={(ev) => { ev.preventDefault(); void submit(); }} className="flex gap-1.5 border-b border-border p-3">
        <input value={goal} onChange={(ev) => setGoal(ev.target.value)} placeholder="Give the team a research goal…" disabled={active.length > 0}
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus:border-primary" />
        <button type="submit" disabled={goal.trim().length < 5 || active.length > 0} aria-label="Send goal" className="rounded-md bg-primary px-2.5 text-primary-foreground disabled:opacity-50"><Send className="h-3.5 w-3.5" /></button>
      </form>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {!feed.length && <p className="text-center text-xs text-muted-foreground">No activity yet. Give the team a goal to start.</p>}
        {feed.map((f) => {
          const I = META[f.agent].icon;
          return (
            <div key={f.id} className={cn("rounded-md border bg-card p-3", f.gate?.state === "pending" ? "border-primary/40" : "border-border")}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[11px] font-medium"><I className="h-3 w-3 text-node-agent" />{META[f.agent].name}</span>
                <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                  {f.confidence !== undefined && <span className="rounded bg-secondary px-1">{Math.round(f.confidence * 100)}%</span>}{f.time}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{f.text}</p>
              {f.gate?.type === "node" && <p className="mt-1.5 text-[11px] leading-relaxed text-card-foreground/80">{f.gate.proposal.summary}</p>}
              {f.steps && <ol className="mt-2 space-y-0.5 border-l border-border pl-2.5">{f.steps.map((s, i) => <li key={i} className="text-[10px] text-muted-foreground">{i + 1}. {s}</li>)}</ol>}
              {f.gate?.state === "pending" ? (
                <div className="mt-2.5 flex gap-1.5">
                  <button onClick={() => decide(f, true)} className="flex flex-1 items-center justify-center gap-1 rounded-md bg-success/15 py-1 text-[11px] font-medium text-success hover:bg-success/25"><Check className="h-3 w-3" />Approve</button>
                  <button onClick={() => decide(f, false)} className="flex flex-1 items-center justify-center gap-1 rounded-md bg-destructive/15 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/25"><X className="h-3 w-3" />Reject</button>
                </div>
              ) : f.gate && <p className={cn("mt-2 text-[10px] font-medium uppercase tracking-wider", f.gate.state === "approved" ? "text-success" : "text-destructive")}>{f.gate.state}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
