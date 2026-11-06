import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles, X } from "lucide-react";
import { analyzeSource, type AnalyzeResult } from "@/lib/ai/analyze.functions";
import { cn } from "@/lib/utils";

type Item = { id: string; kind: string; title: string; tags: string[] };
export default function AnalyzeDialog({ items, onClose, onAdd }: {
  items: Item[]; onClose: () => void;
  onAdd: (r: { kind: "paper" | "code"; title: string; summary: string; tags: string[]; links: string[] }) => void;
}) {
  const run = useServerFn(analyzeSource);
  const [kind, setKind] = useState<"paper" | "code">("paper");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<AnalyzeResult | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const title = (id: string) => items.find((i) => i.id === id)?.title ?? id;

  const analyze = async () => {
    setBusy(true); setRes(null);
    try {
      const r = await run({ data: { kind, text, items } });
      setRes(r); setPicked(r.connections.map((c) => c.id));
    } catch { setRes({ title: "", summary: "", tags: [], connections: [], error: "Request failed. Check your input and try again." }); }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-panel" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" />AI Summarize & Connect</span>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <div className="flex gap-1 rounded-md bg-background p-1 text-xs">
            {(["paper", "code"] as const).map((k) => (
              <button key={k} onClick={() => setKind(k)} className={cn("flex-1 rounded px-2 py-1", kind === k ? "bg-accent text-foreground" : "text-muted-foreground")}>
                {k === "paper" ? "Paper abstract" : "Code description"}
              </button>
            ))}
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} maxLength={8000}
            placeholder={kind === "paper" ? "Paste a paper abstract…" : "Describe the code, repo or module…"}
            className="w-full resize-none rounded-md border border-input bg-background p-2 text-xs outline-none placeholder:text-muted-foreground focus:border-primary" />
          <button onClick={analyze} disabled={busy || text.trim().length < 20}
            className="flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}{busy ? "Analyzing…" : "Analyze"}
          </button>
          {res?.error && <p className="text-xs text-destructive">{res.error}</p>}
          {res && !res.error && (
            <div className="flex flex-col gap-3 rounded-md border border-border bg-background p-3">
              <div>
                <p className="text-sm font-medium">{res.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{res.summary}</p>
                <div className="mt-2 flex flex-wrap gap-1">{res.tags.map((t) => <span key={t} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">#{t}</span>)}</div>
              </div>
              <div>
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Suggested connections</p>
                {!res.connections.length && <p className="text-xs text-muted-foreground">No related cards found.</p>}
                {res.connections.map((c) => (
                  <label key={c.id} className="flex cursor-pointer gap-2 rounded px-1 py-1 text-xs hover:bg-accent/50">
                    <input type="checkbox" className="mt-0.5 accent-primary" checked={picked.includes(c.id)}
                      onChange={() => setPicked((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id]))} />
                    <span><span className="font-medium">{title(c.id)}</span><span className="block text-muted-foreground">{c.reason}</span></span>
                  </label>
                ))}
              </div>
              <button onClick={() => onAdd({ kind, title: res.title, summary: res.summary, tags: res.tags, links: picked })}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent">Add card to canvas</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
