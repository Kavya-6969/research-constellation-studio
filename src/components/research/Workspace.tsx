import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow, Background, BackgroundVariant, Controls, MiniMap, Handle, Position,
  useNodesState, useEdgesState, addEdge, type Node, type Edge, type NodeProps, type Connection, type ReactFlowInstance,
} from "@xyflow/react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import AuthGate from "./AuthGate";
import AnalyzeDialog from "./AnalyzeDialog";
import AgentPanel, { type Proposal } from "./AgentPanel";
import ExperimentPanel from "./ExperimentPanel";
import TimelineDrawer from "./TimelineDrawer";
import WhyDialog from "./WhyDialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { createExperiment, type Experiment } from "@/lib/experiments";
import { buildWorkspaceExport, downloadWorkspace, workspaceMarkdown } from "@/lib/workspace-export";
import { appendEvents, diffCanvas, inferTimeline, parseTimeline, replayTimeline, touchedBy, type Canvas, type TimelineEdge, type TimelineEvent, type TimelineNode } from "@/lib/timeline";
import { listDirty, markSynced, readList, readWorkspace, removeWorkspace, writeList, writeWorkspace, type CachedWorkspace } from "@/lib/offline-cache";
import "@xyflow/react/dist/style.css";
import {
  FileText, Database, StickyNote, Brain, Search, PanelLeftClose, PanelLeftOpen, PanelRightClose,
  PanelRightOpen, Upload, Network, Hash, FolderKanban, Plus, Sparkles, Loader2, LogOut, Trash2, Code2, FlaskConical, Download, History, Scale, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Kind = "paper" | "dataset" | "note" | "code" | "agent" | "experiment";
type ArtifactData = { kind: Kind; title: string; meta: string; tags: string[]; dim?: boolean; fresh?: boolean; experiment?: Experiment };

const KIND: Record<Kind, { icon: typeof FileText; label: string; text: string; bg: string }> = {
  paper: { icon: FileText, label: "Paper", text: "text-node-paper", bg: "bg-node-paper/10" },
  dataset: { icon: Database, label: "Dataset", text: "text-node-dataset", bg: "bg-node-dataset/10" },
  note: { icon: StickyNote, label: "Note", text: "text-node-note", bg: "bg-node-note/10" },
  code: { icon: Code2, label: "Code", text: "text-node-code", bg: "bg-node-code/10" },
  agent: { icon: Brain, label: "Agent Thought", text: "text-node-agent", bg: "bg-node-agent/10" },
  experiment: { icon: FlaskConical, label: "Experiment Node", text: "text-node-experiment", bg: "bg-node-experiment/10" },
};

function ArtifactNode({ data, selected }: NodeProps<Node<ArtifactData>>) {
  const k = KIND[data.kind];
  const Icon = k.icon;
  return (
    <div className={cn(
      "w-64 rounded-lg border border-border bg-card p-3 transition-all duration-200",
      selected || data.fresh ? "shadow-glow" : "hover:border-muted-foreground/40",
      data.fresh && "border-primary",
      data.dim && "opacity-25",
    )}>
      <Handle type="target" position={Position.Left} />
      <div className="mb-2 flex items-center gap-2">
        <span className={cn("flex h-6 w-6 items-center justify-center rounded-md", k.bg, k.text)}><Icon className="h-3.5 w-3.5" /></span>
        <span className={cn("text-[10px] font-medium uppercase tracking-wider", k.text)}>{k.label}</span>
      </div>
      <p className="text-sm font-medium leading-snug text-card-foreground">{data.title}</p>
      <p className="mt-1 font-mono text-[11px] text-muted-foreground line-clamp-3">{data.meta}</p>
      {data.kind === "experiment" && <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-2 font-mono">
        <div><p className="text-[10px] text-muted-foreground">Accuracy</p><p className="text-sm text-node-experiment">{(data.experiment ?? createExperiment()).metrics.accuracy.toFixed(2)}%</p></div>
        <div><p className="text-[10px] text-muted-foreground">Latency</p><p className="text-sm">{(data.experiment ?? createExperiment()).metrics.latencyMs.toFixed(1)} ms</p></div>
      </div>}
      <div className="mt-2.5 flex flex-wrap gap-1">
        {data.tags.map((t) => <span key={t} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">#{t}</span>)}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { artifact: ArtifactNode, experiment: ArtifactNode };

const n = (id: string, x: number, y: number, d: ArtifactData): Node<ArtifactData> => ({ id, type: "artifact", position: { x, y }, data: d });
const initialNodes = [
  n("1", 0, 80, { kind: "paper", title: "Attention Is All You Need", meta: "Vaswani et al. · 2017", tags: ["AI", "Transformer"] }),
  n("2", 0, 300, { kind: "paper", title: "BERT: Pre-training of Deep Bidirectional Transformers", meta: "Devlin et al. · 2018", tags: ["AI", "Transformer", "NLP"] }),
  n("3", 360, 0, { kind: "dataset", title: "WMT 2014 English–German", meta: "4.5M sentence pairs", tags: ["Datasets", "NLP"] }),
  n("4", 360, 220, { kind: "agent", title: "Self-attention scales O(n²) — investigate sparse variants for long context.", meta: "Analyst Agent · 2m ago", tags: ["AI", "Transformer"] }),
  n("5", 360, 420, { kind: "dataset", title: "GLUE Benchmark", meta: "9 tasks · 1.2GB", tags: ["Datasets"] }),
  n("6", 720, 120, { kind: "paper", title: "Longformer: The Long-Document Transformer", meta: "Beltagy et al. · 2020", tags: ["Transformer"] }),
  n("8", 720, 540, { kind: "code", title: "huggingface/transformers — modeling_longformer.py", meta: "Python · GitHub", tags: ["AI", "Transformer"] }),
  n("7", 720, 340, { kind: "note", title: "Compare fine-tuning cost of BERT vs Longformer on GLUE.", meta: "You · today", tags: ["AI"] }),
];
const e = (s: string, t: string, a = false): Edge => ({ id: `${s}-${t}`, source: s, target: t, type: "smoothstep", animated: a });
const initialEdges = [e("1", "3"), e("1", "4", true), e("2", "4"), e("2", "5"), e("4", "6", true), e("5", "7"), e("6", "7"), e("6", "8")];

const TAGS = ["AI", "Transformer", "Datasets", "NLP"];
type WsRow = { id: string; name: string };
type SaveState = "idle" | "saving" | "saved" | "error" | "offline";

const clean = (ns: Node<ArtifactData>[]) =>
  ns.map(({ id, type, position, data }) => ({ id, type, position, data: { kind: data.kind, title: data.title, meta: data.meta, tags: data.tags, ...(data.kind === "experiment" ? { experiment: data.experiment ?? createExperiment() } : {}) } }));
const cleanEdges = (es: Edge[]) => es.map(({ id, source, target, type, animated, sourceHandle, targetHandle }) => ({ id, source, target, type, animated, sourceHandle, targetHandle }));

export default function Workspace() {
  return <AuthGate>{(s) => <WorkspaceInner userId={s.user.id} />}</AuthGate>;
}

function WorkspaceInner({ userId }: { userId: string }) {
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
  const [experimentId, setExperimentId] = useState<string | null>(null);
  const selectedExperiment = nodes.find((node) => node.id === experimentId && node.data.kind === "experiment");
  const skipSave = useRef(true);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const timelineRef = useRef<TimelineEvent[]>([]);
  const baseRef = useRef<Canvas | null>(null);
  const [replay, setReplay] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [replayNodes, setReplayNodes, onReplayNodesChange] = useNodesState<Node<ArtifactData>>([]);
  const [replayEdges, setReplayEdges] = useState<Edge[]>([]);
  const replaying = replay !== null;
  const store = () => window.localStorage;
  const refreshPending = () => setPending(listDirty(store(), userId).length);

  // Push one cached workspace to the cloud; it stays pending locally until this succeeds.
  const pushRemote = async (c: CachedWorkspace) => {
    const { error } = await supabase.from("workspaces")
      .update({ nodes: c.nodes as never, edges: c.edges as never, timeline: c.timeline as never, updated_at: c.updatedAt }).eq("id", c.id);
    if (!error) markSynced(store(), userId, c.id, c.updatedAt);
    return !error;
  };
  const persist = async (id: string, ns: unknown[], es: unknown[], tl: TimelineEvent[]) => {
    const c: CachedWorkspace = { id, nodes: ns, edges: es, timeline: tl, updatedAt: new Date().toISOString(), dirty: true };
    writeWorkspace(store(), userId, c);
    if (!navigator.onLine) { setSave("offline"); refreshPending(); return; }
    setSave("saving");
    const ok = await pushRemote(c);
    setSave(ok ? "saved" : "error");
    refreshPending();
  };
  const flush = useCallback(async () => {
    if (!navigator.onLine) return;
    const dirty = listDirty(window.localStorage, userId);
    if (!dirty.length) { setPending(0); return; }
    setSyncing(true);
    let failed = 0;
    for (const c of dirty) if (!(await pushRemote(c))) failed++;
    setSyncing(false);
    setPending(listDirty(window.localStorage, userId).length);
    setSave(failed ? "error" : "saved");
    if (failed) toast.error("Some changes couldn't sync yet. They're kept on this device.");
    else toast.success("Back online — offline changes synced");
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const up = () => { setOnline(true); void flush(); };
    const down = () => { setOnline(false); setSave("offline"); };
    setOnline(navigator.onLine);
    refreshPending();
    if (navigator.onLine) void flush(); else setSave("offline");
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, [flush]); // eslint-disable-line react-hooks/exhaustive-deps
  const ws = workspaces.find((w) => w.id === wsId)?.name ?? "";

  useEffect(() => {
    setRight(window.innerWidth > 1100);
    setLeft(window.innerWidth > 640);
  }, []);

  // Load workspace list (seed a sample one for new users)
  useEffect(() => {
    (async () => {
      const cached = readList(store(), userId);
      const useCached = (msg: string) => {
        if (!cached.length) { toast.error(msg); return; }
        setWorkspaces(cached); setWsId(cached[0]?.id ?? null);
      };
      if (!navigator.onLine) { useCached("You're offline and no workspaces are saved on this device yet."); return; }
      const { data, error } = await supabase.from("workspaces").select("id,name").order("created_at");
      if (error) { useCached(error.message); return; }
      let rows = data ?? [];
      if (!rows.length) {
        const seed = { nodes: clean(initialNodes), edges: cleanEdges(initialEdges) };
        const { data: created, error: e2 } = await supabase.from("workspaces")
          .insert({ name: "Long-context LLMs", nodes: seed.nodes as never, edges: seed.edges as never, timeline: inferTimeline(seed, new Date().toISOString()) as never })
          .select("id,name").single();
        if (e2) { toast.error(e2.message); return; }
        rows = [created];
      }
      writeList(store(), userId, rows);
      setWorkspaces(rows);
      setWsId(rows[0]?.id ?? null);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load selected workspace's canvas
  useEffect(() => {
    if (!wsId) return;
    setExperimentId(null);
    setReplay(null);
    setLoaded(false);
    let cancelled = false;
    (async () => {
      // Local copy wins when it has unsynced edits or there is no connection.
      const local = readWorkspace(store(), userId, wsId);
      let src: { nodes: unknown; edges: unknown; timeline: unknown } | null = local?.dirty || !navigator.onLine ? local : null;
      if (!src) {
        const { data, error } = await supabase.from("workspaces").select("nodes,edges,timeline").eq("id", wsId).single();
        if (cancelled) return;
        if (error) src = local;
        else {
          src = data;
          writeWorkspace(store(), userId, { id: wsId, nodes: (data.nodes as unknown[]) ?? [], edges: (data.edges as unknown[]) ?? [], timeline: parseTimeline(data.timeline), updatedAt: new Date().toISOString(), dirty: false });
        }
      }
      if (cancelled) return;
      if (!src) { toast.error("This workspace isn't saved on this device yet. Reconnect to open it."); return; }
      const ns = (src.nodes as Node<ArtifactData>[] | null) ?? [];
      const es = (src.edges as Edge[] | null) ?? [];
      const base: Canvas = { nodes: clean(ns), edges: cleanEdges(es) as TimelineEdge[] };
      let tl = parseTimeline(src.timeline);
      const inferred = !tl.length && ns.length > 0;
      if (inferred) tl = inferTimeline(base, new Date().toISOString());
      baseRef.current = base;
      timelineRef.current = tl;
      setTimeline(tl);
      skipSave.current = true;
      setNodes(ns);
      setEdges(es);
      setLoaded(true);
      setSave(navigator.onLine ? "saved" : "offline");
      if (inferred) void persist(wsId, base.nodes, base.edges, tl);
      setTimeout(() => rf?.fitView({ padding: 0.2 }), 50);
    })();
    return () => { cancelled = true; };
  }, [wsId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave on change (debounced); ignore pure selection changes
  const saveKey = useMemo(() => JSON.stringify([clean(nodes), cleanEdges(edges)]), [nodes, edges]);
  useEffect(() => {
    if (!loaded || !wsId) return;
    if (skipSave.current) { skipSave.current = false; return; }
    if (navigator.onLine) setSave("saving");
    const t = setTimeout(() => {
      const [ns, es] = JSON.parse(saveKey) as [TimelineNode[], TimelineEdge[]];
      const tl = appendEvents(timelineRef.current, diffCanvas(baseRef.current, { nodes: ns, edges: es }, new Date().toISOString()));
      baseRef.current = { nodes: ns, edges: es };
      timelineRef.current = tl;
      setTimeline(tl);
      void persist(wsId, ns, es, tl);
    }, 800);
    return () => clearTimeout(t);
  }, [saveKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const newWorkspace = async () => {
    if (!navigator.onLine) { toast.error("Reconnect to create a new workspace."); return; }
    const name = window.prompt("Workspace name", "New workspace")?.trim();
    if (!name) return;
    const { data, error } = await supabase.from("workspaces").insert({ name }).select("id,name").single();
    if (error) { toast.error(error.message); return; }
    setWorkspaces((w) => { const next = [...w, data]; writeList(store(), userId, next); return next; });
    setWsId(data.id);
  };

  const deleteWorkspace = async (id: string) => {
    if (workspaces.length <= 1) { toast.error("Keep at least one workspace."); return; }
    if (!navigator.onLine) { toast.error("Reconnect to delete workspaces."); return; }
    if (!window.confirm("Delete this workspace?")) return;
    const { error } = await supabase.from("workspaces").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    const rest = workspaces.filter((w) => w.id !== id);
    removeWorkspace(store(), userId, id);
    writeList(store(), userId, rest);
    setWorkspaces(rest);
    if (id === wsId) setWsId(rest[0]?.id ?? null);
  };
  const [clustering, setClustering] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const addAnalyzed = (r: { kind: "paper" | "code"; title: string; summary: string; tags: string[]; links: string[] }) => {
    const id = String(Date.now());
    const xs = nodes.map((nd) => nd.position.x);
    setNodes((ns) => [...ns, n(id, (xs.length ? Math.max(...xs) : 0) + 360, 200, { kind: r.kind, title: r.title, meta: r.summary, tags: r.tags })]);
    setEdges((es) => [...es, ...r.links.map((t) => e(id, t, true))]);
    setReplay(null);
    setAiOpen(false);
    toast.success("Card added to canvas");
  };

  const onConnect = useCallback((c: Connection) => setEdges((es) => addEdge({ ...c, type: "smoothstep" }, es)), [setEdges]);

  const shown = useMemo(() => nodes.map((nd) => {
    const q = query.toLowerCase();
    const match = (!q || nd.data.title.toLowerCase().includes(q)) && (!activeTags.length || activeTags.some((t) => nd.data.tags.includes(t)));
    return { ...nd, data: { ...nd.data, dim: !match } };
  }), [nodes, query, activeTags]);


  useEffect(() => {
    if (replay === null) return;
    const snap = replayTimeline(timeline, replay);
    const live = new Map(nodes.map((nd) => [nd.id, nd.position]));
    const hit = touchedBy(timeline[replay]);
    setReplayNodes(snap.nodes.map((nd) => ({
      id: nd.id, type: nd.type ?? "artifact", position: live.get(nd.id) ?? nd.position, draggable: false, selectable: false,
      data: { ...(nd.data as unknown as ArtifactData), fresh: nd.id === hit.nodeId },
    })));
    setReplayEdges(snap.edges.map((ed) => ({ ...(ed as unknown as Edge), animated: ed.id === hit.edgeId, selectable: false })));
  }, [replay, timeline]); // eslint-disable-line react-hooks/exhaustive-deps

  const openTimeline = () => { setExperimentId(null); setPlaying(false); setReplay(timeline.length - 1); };
  const closeTimeline = useCallback(() => { setPlaying(false); setReplay(null); }, []);

  const cluster = () => {
    setClustering(true);
    setTimeout(() => {
      const order: Kind[] = ["paper", "dataset", "code", "agent", "note", "experiment"];
      setNodes((ns) => {
        const cnt: Record<string, number> = {};
        return ns.map((nd) => {
          const col = order.indexOf(nd.data.kind); const row = (cnt[col] = (cnt[col] ?? -1) + 1);
          return { ...nd, position: { x: col * 320, y: row * 200 } };
        });
      });
      setClustering(false);
    }, 700);
  };

  const upload = () => {
    const id = String(Date.now());
    setNodes((ns) => [...ns, n(id, 1080, 220, { kind: "paper", title: "Untitled uploaded source.pdf", meta: "Parsing…", tags: ["AI"] })]);
  };

  const addExperiment = () => {
    const id = crypto.randomUUID();
    const experiment = createExperiment();
    const position = rf ? rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }) : { x: 0, y: 0 };
    setNodes((ns) => [...ns, { id, type: "experiment", position, data: {
      kind: "experiment", title: `Experiment ${ns.filter((node) => node.data.kind === "experiment").length + 1}`,
      meta: "Mock simulation · LR 0.001 · Batch 32 · Layers 6", tags: [], experiment,
    } }]);
    setExperimentId(id);
  };

  const updateExperiment = (experiment: Experiment) => {
    setNodes((ns) => ns.map((node) => node.id !== experimentId ? node : { ...node, data: {
      ...node.data, experiment,
      meta: `Mock simulation · LR ${experiment.parameters.learningRate} · Batch ${experiment.parameters.batchSize} · Layers ${experiment.parameters.layers}`,
    } }));
  };

  const exportWorkspace = (format: "json" | "md") => {
    const workspace = buildWorkspaceExport(ws, nodes, edges);
    downloadWorkspace(format === "json" ? JSON.stringify(workspace, null, 2) : workspaceMarkdown(workspace), ws, format);
  };

  const spawn = (p: Proposal, agent: string) => {
    const id = `${agent}-${Date.now()}`;
    const xs = nodes.map((nd) => nd.position.x);
    setNodes((ns) => [...ns, n(id, (xs.length ? Math.max(...xs) : 0) + 360, 80 + Math.random() * 400, { kind: p.kind, title: p.title, meta: p.summary, tags: p.tags })]);
    setEdges((es) => [...es, ...p.links.map((t) => e(id, t, true))]);
    setReplay(null);
    toast.success(`Added “${p.title}”`);
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-canvas text-foreground">
      <Toaster theme="dark" />
      <WhyDialog open={whyOpen} onOpenChange={setWhyOpen} />
      {selectedExperiment && <ExperimentPanel title={selectedExperiment.data.title} experiment={selectedExperiment.data.experiment ?? createExperiment()} onChange={updateExperiment} onClose={() => setExperimentId(null)} />}
      {aiOpen && <AnalyzeDialog items={nodes.map((nd) => ({ id: nd.id, kind: nd.data.kind, title: nd.data.title, tags: nd.data.tags }))} onClose={() => setAiOpen(false)} onAdd={addAnalyzed} />}
      {/* Header */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-panel px-3 py-2">
        <Button variant="ghost" size="icon" onClick={() => { setLeft(!left); if (window.innerWidth <= 640) setRight(false); }} className="h-7 w-7 text-muted-foreground" aria-label="Toggle sidebar" title="Toggle sidebar">
          {left ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2 max-sm:basis-[calc(100%-3rem)]">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"><Network className="h-3.5 w-3.5" /></div>
          <span className="shrink-0 text-sm font-semibold">GLIMPSE</span>
          <span className="text-muted-foreground">/</span>
          <span className="truncate text-sm text-muted-foreground">{ws}</span>
        </div>
        <div className="ml-auto flex max-w-full flex-wrap items-center gap-2">
          <SyncPill online={online} syncing={syncing || save === "saving"} failed={save === "error"} pending={pending} onRetry={() => void flush()} />
          <Button variant="ghost" size="icon" onClick={() => supabase.auth.signOut()} className="h-7 w-7 text-muted-foreground" aria-label="Sign out" title="Sign out"><LogOut className="h-4 w-4" /></Button>
          <div className="hidden items-center gap-2 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground xl:flex">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-success" /></span>
            Agent Team · 4 agents
          </div>
          <Button variant="outline" size="sm" disabled={replaying} onClick={() => setAiOpen(true)} title="AI Summarize" className="border-primary/50 text-primary"><Sparkles /><span className="hidden lg:inline">AI Summarize</span></Button>
          <Button variant="outline" size="sm" disabled={replaying} onClick={upload} title="Upload Source"><Upload /><span className="hidden lg:inline">Upload Source</span></Button>
          <Button variant="outline" size="sm" onClick={addExperiment} disabled={!loaded || replaying} title="Add experiment" aria-label="Add experiment"><FlaskConical /><span className="hidden sm:inline">Experiment</span></Button>
          <Button size="sm" onClick={cluster} disabled={clustering || !loaded || replaying} title="Cluster Canvas">
            {clustering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles />}<span className="hidden lg:inline">Cluster Canvas</span>
          </Button>
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" disabled={!loaded} aria-label="Export workspace" title="Export workspace"><Download /><span className="hidden sm:inline">Export</span></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => exportWorkspace("md")}><FileText />Export Markdown</DropdownMenuItem><DropdownMenuItem onSelect={() => exportWorkspace("json")}><Code2 />Export JSON</DropdownMenuItem></DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" onClick={() => { setRight(!right); if (window.innerWidth <= 640) setLeft(false); }} className="h-7 w-7 text-muted-foreground" aria-label="Toggle agent panel" title="Toggle agent panel">
            {right ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* Left sidebar */}
        <aside className={cn("flex shrink-0 flex-col overflow-hidden border-r border-border bg-panel transition-all duration-300 max-sm:absolute max-sm:inset-y-0 max-sm:left-0 max-sm:z-20", left ? "w-60" : "w-0 border-r-0")}>
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
            <Section title="TAGS">
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
          <div className="w-60 shrink-0 border-t border-border p-3">
            <button onClick={() => setWhyOpen(true)} className="group w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/50">
              <span className="flex items-center gap-2 text-xs font-medium text-foreground"><Scale className="h-3.5 w-3.5 text-primary" />Why ResearchGraph?</span>
              <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">Visual multi-agent graph vs. tab-heavy research tools.</span>
            </button>
          </div>
        </aside>

        {/* Canvas */}
        <main className="relative min-w-0 flex-1">
          <ReactFlow nodes={replaying ? replayNodes : shown} edges={replaying ? replayEdges : edges}
            onNodesChange={replaying ? onReplayNodesChange : onNodesChange} onEdgesChange={replaying ? () => {} : onEdgesChange}
            onConnect={replaying ? () => {} : onConnect} onInit={setRf}
            nodesDraggable={!replaying} nodesConnectable={!replaying} elementsSelectable={!replaying}
            onNodeClick={(_, node) => { if (!replaying && node.data.kind === "experiment") setExperimentId(node.id); }}
            nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.2 }} proOptions={{ hideAttribution: true }} colorMode="dark" minZoom={0.2}>
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--grid-dot)" bgColor="var(--canvas)" />
            {!replaying && <Controls showInteractive={false} />}
            {!replaying && <MiniMap className="max-sm:hidden" pannable zoomable maskColor="color-mix(in oklab, var(--canvas) 70%, transparent)" nodeColor="var(--border)" />}
          </ReactFlow>
          {replaying ? (
            <TimelineDrawer events={timeline} index={replay} onIndex={setReplay} playing={playing} onPlaying={setPlaying} onClose={closeTimeline} />
          ) : (
            <Button variant="outline" size="sm" onClick={openTimeline} disabled={!loaded} aria-label="Open timeline"
              className="absolute bottom-4 left-1/2 z-10 h-7 -translate-x-1/2 rounded-full bg-panel/90 px-3 text-xs backdrop-blur">
              <History className="text-primary" />Timeline<span className="font-mono text-[10px] text-muted-foreground">{timeline.length}</span>
            </Button>
          )}
        </main>

        {/* Right agent sidebar */}
        <aside className={cn("flex shrink-0 flex-col overflow-hidden border-l border-border bg-panel transition-all duration-300 max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-20", right ? "w-80" : "w-0 border-l-0")}>
          <AgentPanel items={nodes.map((nd) => ({ id: nd.id, kind: nd.data.kind, title: nd.data.title, tags: nd.data.tags }))} onSpawn={spawn} />
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

function SyncPill({ online, syncing, failed, pending, onRetry }: { online: boolean; syncing: boolean; failed: boolean; pending: number; onRetry: () => void }) {
  const [dot, label, detail] = !online
    ? ["bg-node-experiment", "Offline", pending ? ` · ${pending} pending` : " · saved locally"]
    : syncing ? ["bg-primary animate-pulse", "Online", " — Syncing…"]
    : failed ? ["bg-destructive", "Sync failed", " · Retry"]
    : ["bg-success", "Online", " · Synced"];
  const content = <><span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot)} /><span>{label}</span><span className="hidden md:inline">{detail}</span>{syncing && <RefreshCw className="h-3 w-3 animate-spin" />}</>;
  const cls = cn("flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px]", !online ? "border-node-experiment/40 text-node-experiment" : failed ? "border-destructive/50 text-destructive" : "border-border text-muted-foreground");
  return failed && online
    ? <button onClick={onRetry} className={cn(cls, "hover:bg-destructive/10")} aria-label="Retry sync" title="Retry sync">{content}</button>
    : <span role="status" aria-live="polite" className={cls} title={!online ? "Changes are kept on this device and sync when you reconnect." : undefined}>{content}</span>;
}
