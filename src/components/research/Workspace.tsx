import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow, Background, BackgroundVariant, Controls, MiniMap, Handle, Position,
  useNodesState, useEdgesState, addEdge, type Node, type Edge, type NodeProps, type Connection, type ReactFlowInstance,
} from "@xyflow/react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import AuthGate from "./AuthGate";
import "@xyflow/react/dist/style.css";
import {
  FileText, Database, StickyNote, Brain, Search, PanelLeftClose, PanelLeftOpen, PanelRightClose,
  PanelRightOpen, Upload, Network, Check, X, Hash, FolderKanban, Plus, Sparkles, Loader2, LogOut, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Kind = "paper" | "dataset" | "note" | "agent";
type ArtifactData = { kind: Kind; title: string; meta: string; tags: string[]; dim?: boolean };

const KIND: Record<Kind, { icon: typeof FileText; label: string; text: string; bg: string }> = {
  paper: { icon: FileText, label: "Paper", text: "text-node-paper", bg: "bg-node-paper/10" },
  dataset: { icon: Database, label: "Dataset", text: "text-node-dataset", bg: "bg-node-dataset/10" },
  note: { icon: StickyNote, label: "Note", text: "text-node-note", bg: "bg-node-note/10" },
  agent: { icon: Brain, label: "Agent Thought", text: "text-node-agent", bg: "bg-node-agent/10" },
};

function ArtifactNode({ data, selected }: NodeProps<Node<ArtifactData>>) {
  const k = KIND[data.kind];
  const Icon = k.icon;
  return (
    <div className={cn(
      "w-64 rounded-lg border border-border bg-card p-3 transition-all duration-200",
      selected ? "shadow-glow" : "hover:border-muted-foreground/40",
      data.dim && "opacity-25",
    )}>
      <Handle type="target" position={Position.Left} />
      <div className="mb-2 flex items-center gap-2">
        <span className={cn("flex h-6 w-6 items-center justify-center rounded-md", k.bg, k.text)}><Icon className="h-3.5 w-3.5" /></span>
        <span className={cn("text-[10px] font-medium uppercase tracking-wider", k.text)}>{k.label}</span>
      </div>
      <p className="text-sm font-medium leading-snug text-card-foreground">{data.title}</p>
      <p className="mt-1 font-mono text-[11px] text-muted-foreground">{data.meta}</p>
      <div className="mt-2.5 flex flex-wrap gap-1">
        {data.tags.map((t) => <span key={t} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">#{t}</span>)}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { artifact: ArtifactNode };

const n = (id: string, x: number, y: number, d: ArtifactData): Node<ArtifactData> => ({ id, type: "artifact", position: { x, y }, data: d });
const initialNodes = [
  n("1", 0, 80, { kind: "paper", title: "Attention Is All You Need", meta: "Vaswani et al. · 2017", tags: ["AI", "Transformer"] }),
  n("2", 0, 300, { kind: "paper", title: "BERT: Pre-training of Deep Bidirectional Transformers", meta: "Devlin et al. · 2018", tags: ["AI", "Transformer", "NLP"] }),
  n("3", 360, 0, { kind: "dataset", title: "WMT 2014 English–German", meta: "4.5M sentence pairs", tags: ["Datasets", "NLP"] }),
  n("4", 360, 220, { kind: "agent", title: "Self-attention scales O(n²) — investigate sparse variants for long context.", meta: "Analyst Agent · 2m ago", tags: ["AI", "Transformer"] }),
  n("5", 360, 420, { kind: "dataset", title: "GLUE Benchmark", meta: "9 tasks · 1.2GB", tags: ["Datasets"] }),
  n("6", 720, 120, { kind: "paper", title: "Longformer: The Long-Document Transformer", meta: "Beltagy et al. · 2020", tags: ["Transformer"] }),
  n("7", 720, 340, { kind: "note", title: "Compare fine-tuning cost of BERT vs Longformer on GLUE.", meta: "You · today", tags: ["AI"] }),
];
const e = (s: string, t: string, a = false): Edge => ({ id: `${s}-${t}`, source: s, target: t, type: "smoothstep", animated: a });
const initialEdges = [e("1", "3"), e("1", "4", true), e("2", "4"), e("2", "5"), e("4", "6", true), e("5", "7"), e("6", "7")];

const TAGS = ["AI", "Transformer", "Datasets", "NLP"];
type WsRow = { id: string; name: string };
type SaveState = "idle" | "saving" | "saved" | "error";

const clean = (ns: Node<ArtifactData>[]) =>
  ns.map(({ id, type, position, data }) => ({ id, type, position, data: { kind: data.kind, title: data.title, meta: data.meta, tags: data.tags } }));
const cleanEdges = (es: Edge[]) => es.map(({ id, source, target, type, animated, sourceHandle, targetHandle }) => ({ id, source, target, type, animated, sourceHandle, targetHandle }));

type Thought = { id: number; agent: string; text: string; status: "pending" | "approved" | "rejected" | "info"; time: string };
const initialThoughts: Thought[] = [
  { id: 1, agent: "Controller", text: "Proposing to link Longformer to the attention-complexity thought and add 3 related sparse-attention papers.", status: "pending", time: "now" },
  { id: 2, agent: "Retriever", text: "Found 'Big Bird: Transformers for Longer Sequences' (Zaheer 2020). Add to canvas?", status: "pending", time: "1m" },
  { id: 3, agent: "Analyst", text: "Summarized BERT methodology. Extracted 4 key claims.", status: "info", time: "3m" },
  { id: 4, agent: "Controller", text: "Clustered 7 artifacts into 2 themes: Architecture, Evaluation.", status: "approved", time: "6m" },
];

export default function Workspace() {
  return <AuthGate>{() => <WorkspaceInner />}</AuthGate>;
}

function WorkspaceInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<ArtifactData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [left, setLeft] = useState(true);
  const [right, setRight] = useState(true);
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [workspaces, setWorkspaces] = useState<WsRow[]>([]);
  const [wsId, setWsId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [save, setSave] = useState<SaveState>("idle");
  const [rf, setRf] = useState<ReactFlowInstance<Node<ArtifactData>, Edge> | null>(null);
  const skipSave = useRef(true);
  const ws = workspaces.find((w) => w.id === wsId)?.name ?? "";

  // Load workspace list (seed a sample one for new users)
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("workspaces").select("id,name").order("created_at");
      if (error) { toast.error(error.message); return; }
      let rows = data ?? [];
      if (!rows.length) {
        const { data: created, error: e2 } = await supabase.from("workspaces")
          .insert({ name: "Long-context LLMs", nodes: clean(initialNodes) as never, edges: cleanEdges(initialEdges) as never })
          .select("id,name").single();
        if (e2) { toast.error(e2.message); return; }
        rows = [created];
      }
      setWorkspaces(rows);
      setWsId(rows[0]!.id);
    })();
  }, []);

  // Load selected workspace's canvas
  useEffect(() => {
    if (!wsId) return;
    setLoaded(false);
    (async () => {
      const { data, error } = await supabase.from("workspaces").select("nodes,edges").eq("id", wsId).single();
      if (error) { toast.error(error.message); return; }
      skipSave.current = true;
      setNodes((data.nodes as unknown as Node<ArtifactData>[]) ?? []);
      setEdges((data.edges as unknown as Edge[]) ?? []);
      setLoaded(true);
      setSave("saved");
      setTimeout(() => rf?.fitView({ padding: 0.2 }), 50);
    })();
  }, [wsId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave on change (debounced); ignore pure selection changes
  const saveKey = useMemo(() => JSON.stringify([clean(nodes), cleanEdges(edges)]), [nodes, edges]);
  useEffect(() => {
    if (!loaded || !wsId) return;
    if (skipSave.current) { skipSave.current = false; return; }
    setSave("saving");
    const t = setTimeout(async () => {
      const [ns, es] = JSON.parse(saveKey);
      const { error } = await supabase.from("workspaces").update({ nodes: ns, edges: es, updated_at: new Date().toISOString() }).eq("id", wsId);
      setSave(error ? "error" : "saved");
    }, 800);
    return () => clearTimeout(t);
  }, [saveKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const newWorkspace = async () => {
    const name = window.prompt("Workspace name", "New workspace")?.trim();
    if (!name) return;
    const { data, error } = await supabase.from("workspaces").insert({ name }).select("id,name").single();
    if (error) { toast.error(error.message); return; }
    setWorkspaces((w) => [...w, data]);
    setWsId(data.id);
  };

  const deleteWorkspace = async (id: string) => {
    if (workspaces.length <= 1) { toast.error("Keep at least one workspace."); return; }
    if (!window.confirm("Delete this workspace?")) return;
    const { error } = await supabase.from("workspaces").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    const rest = workspaces.filter((w) => w.id !== id);
    setWorkspaces(rest);
    if (id === wsId) setWsId(rest[0]!.id);
  };
  const [thoughts, setThoughts] = useState(initialThoughts);
  const [clustering, setClustering] = useState(false);

  const onConnect = useCallback((c: Connection) => setEdges((es) => addEdge({ ...c, type: "smoothstep" }, es)), [setEdges]);

  const shown = useMemo(() => nodes.map((nd) => {
    const q = query.toLowerCase();
    const match = (!q || nd.data.title.toLowerCase().includes(q)) && (!activeTags.length || activeTags.some((t) => nd.data.tags.includes(t)));
    return { ...nd, data: { ...nd.data, dim: !match } };
  }), [nodes, query, activeTags]);

  const pending = thoughts.filter((t) => t.status === "pending").length;

  const cluster = () => {
    setClustering(true);
    setTimeout(() => {
      const order: Kind[] = ["paper", "dataset", "agent", "note"];
      setNodes((ns) => {
        const cnt: Record<string, number> = {};
        return ns.map((nd) => {
          const col = order.indexOf(nd.data.kind); const row = (cnt[col] = (cnt[col] ?? -1) + 1);
          return { ...nd, position: { x: col * 320, y: row * 200 } };
        });
      });
      setThoughts((t) => [{ id: Date.now(), agent: "Controller", text: "Re-clustered canvas by artifact type.", status: "info", time: "now" }, ...t]);
      setClustering(false);
    }, 700);
  };

  const upload = () => {
    const id = String(Date.now());
    setNodes((ns) => [...ns, n(id, 1080, 220, { kind: "paper", title: "Untitled uploaded source.pdf", meta: "Parsing…", tags: ["AI"] })]);
    setThoughts((t) => [{ id: Date.now(), agent: "Retriever", text: "New source uploaded. Link it to related Transformer papers?", status: "pending", time: "now" }, ...t]);
  };

  const decide = (id: number, status: "approved" | "rejected") => setThoughts((t) => t.map((x) => (x.id === id ? { ...x, status } : x)));

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-canvas text-foreground">
      <Toaster theme="dark" />
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-panel px-3">
        <button onClick={() => setLeft(!left)} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Toggle sidebar">
          {left ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground"><Network className="h-3.5 w-3.5" /></div>
          <span className="text-sm font-semibold">ResearchGraph</span>
          <span className="text-muted-foreground">/</span>
          <span className="truncate text-sm text-muted-foreground">{ws}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className={cn("hidden text-[11px] md:inline", save === "error" ? "text-destructive" : "text-muted-foreground")}>
            {save === "saving" ? "Saving…" : save === "saved" ? "All changes saved" : save === "error" ? "Save failed" : ""}
          </span>
          <button onClick={() => supabase.auth.signOut()} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Sign out" title="Sign out"><LogOut className="h-4 w-4" /></button>
          <div className="hidden items-center gap-2 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground sm:flex">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-success" /></span>
            Agent Team · 4 active
          </div>
          <button onClick={upload} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"><Upload className="h-3.5 w-3.5" />Upload Source</button>
          <button onClick={cluster} disabled={clustering} className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-70">
            {clustering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}Cluster Canvas
          </button>
          <button onClick={() => setRight(!right)} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Toggle agent panel">
            {right ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left sidebar */}
        <aside className={cn("flex shrink-0 flex-col overflow-hidden border-r border-border bg-panel transition-all duration-300", left ? "w-60" : "w-0 border-r-0")}>
          <div className="flex min-h-0 w-60 flex-1 flex-col gap-5 overflow-y-auto p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input value={query} onChange={(ev) => setQuery(ev.target.value)} placeholder="Search nodes…"
                className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-2 text-xs outline-none placeholder:text-muted-foreground focus:border-primary" />
            </div>
            <Section title="Workspaces" action={<Plus className="h-3.5 w-3.5" />} onAction={newWorkspace}>
              {workspaces.map((w) => (
                <div key={w.id} className={cn("group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs", w.id === wsId ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60")}>
                  <button onClick={() => setWsId(w.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <FolderKanban className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{w.name}</span>
                  </button>
                  <button onClick={() => deleteWorkspace(w.id)} aria-label={`Delete ${w.name}`} className="opacity-0 hover:text-destructive group-hover:opacity-100"><Trash2 className="h-3 w-3" /></button>
                </div>
              ))}
            </Section>
            <Section title="Tags">
              {TAGS.map((t) => {
                const on = activeTags.includes(t);
                return (
                  <button key={t} onClick={() => setActiveTags((a) => (on ? a.filter((x) => x !== t) : [...a, t]))}
                    className={cn("flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs", on ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent/60")}>
                    <span className="flex items-center gap-2"><Hash className="h-3.5 w-3.5" />{t}</span>
                    <span className="font-mono text-[10px]">{nodes.filter((nd) => nd.data.tags.includes(t)).length}</span>
                  </button>
                );
              })}
            </Section>
            <Section title="Artifacts">
              {(Object.keys(KIND) as Kind[]).map((k) => {
                const I = KIND[k].icon;
                return (
                  <div key={k} className="flex items-center justify-between px-2 py-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-2"><I className={cn("h-3.5 w-3.5", KIND[k].text)} />{KIND[k].label}</span>
                    <span className="font-mono text-[10px]">{nodes.filter((nd) => nd.data.kind === k).length}</span>
                  </div>
                );
              })}
            </Section>
          </div>
        </aside>

        {/* Canvas */}
        <main className="relative min-w-0 flex-1">
          <ReactFlow nodes={shown} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onInit={setRf}
            nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.2 }} proOptions={{ hideAttribution: true }} colorMode="dark" minZoom={0.2}>
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--grid-dot)" bgColor="var(--canvas)" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable maskColor="color-mix(in oklab, var(--canvas) 70%, transparent)" nodeColor="var(--border)" />
          </ReactFlow>
        </main>

        {/* Right agent sidebar */}
        <aside className={cn("flex shrink-0 flex-col overflow-hidden border-l border-border bg-panel transition-all duration-300", right ? "w-80" : "w-0 border-l-0")}>
          <div className="flex w-80 items-center justify-between border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Agent Activity</p>
              <p className="text-[11px] text-muted-foreground">Controller · live feed</p>
            </div>
            {pending > 0 && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">{pending} awaiting</span>}
          </div>
          <div className="mx-4 mt-3 w-72 rounded-md border border-border bg-background/50 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Current task</p>
            <p className="mt-1 flex items-center gap-2 text-xs"><Loader2 className="h-3 w-3 animate-spin text-primary" />Mapping citations for long-context papers</p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-secondary"><div className="h-full w-3/5 rounded-full bg-primary" /></div>
          </div>
          <div className="min-h-0 w-80 flex-1 space-y-2 overflow-y-auto p-4">
            {thoughts.map((t) => (
              <div key={t.id} className={cn("rounded-md border bg-card p-3 transition-colors", t.status === "pending" ? "border-primary/40" : "border-border")}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[11px] font-medium"><Brain className="h-3 w-3 text-node-agent" />{t.agent}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{t.time}</span>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{t.text}</p>
                {t.status === "pending" ? (
                  <div className="mt-2.5 flex gap-1.5">
                    <button onClick={() => decide(t.id, "approved")} className="flex flex-1 items-center justify-center gap-1 rounded-md bg-success/15 py-1 text-[11px] font-medium text-success hover:bg-success/25"><Check className="h-3 w-3" />Approve</button>
                    <button onClick={() => decide(t.id, "rejected")} className="flex flex-1 items-center justify-center gap-1 rounded-md bg-destructive/15 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/25"><X className="h-3 w-3" />Reject</button>
                  </div>
                ) : t.status !== "info" && (
                  <p className={cn("mt-2 text-[10px] font-medium uppercase tracking-wider", t.status === "approved" ? "text-success" : "text-destructive")}>{t.status}</p>
                )}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Section({ title, action, onAction, children }: { title: string; action?: React.ReactNode; onAction?: () => void; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {title}{action && <button onClick={onAction} aria-label={`Add ${title}`} className="hover:text-foreground">{action}</button>}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
