import { useEffect } from "react";
import { History, Pause, Play, SkipBack, SkipForward, ChevronLeft, ChevronRight, Radio, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { Category, TimelineEvent } from "@/lib/timeline";

const DOT: Record<Category, string> = {
  source: "bg-node-paper", agent: "bg-node-agent", experiment: "bg-node-experiment",
  note: "bg-node-note", link: "bg-primary", remove: "bg-destructive",
};
const LEGEND: [Category, string][] = [["source", "Sources"], ["agent", "Agents"], ["experiment", "Experiments"], ["link", "Links"]];
const when = (at: string) => new Date(at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default function TimelineDrawer({ events, index, onIndex, playing, onPlaying, onClose }: {
  events: TimelineEvent[]; index: number; onIndex: (i: number) => void;
  playing: boolean; onPlaying: (p: boolean) => void; onClose: () => void;
}) {
  const last = events.length - 1;
  const ev = events[index];
  useEffect(() => {
    if (!playing) return;
    if (index >= last) { onPlaying(false); return; }
    const t = setTimeout(() => onIndex(index + 1), 750);
    return () => clearTimeout(t);
  }, [playing, index, last, onIndex, onPlaying]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea")) return;
      if (e.key === "ArrowLeft") onIndex(Math.max(0, index - 1));
      if (e.key === "ArrowRight") onIndex(Math.min(last, index + 1));
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [index, last, onIndex, onClose]);

  return (
    <div role="region" aria-label="Timeline replay" className="absolute inset-x-2 bottom-2 z-10 rounded-lg border border-border bg-panel/95 p-3 shadow-lg backdrop-blur animate-in fade-in slide-in-from-bottom-2 duration-200 sm:inset-x-4 sm:bottom-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-primary"><History className="h-3.5 w-3.5" />Replay</span>
        <span className="font-mono text-[11px] text-muted-foreground">{events.length ? `${index + 1} / ${events.length}` : "0 / 0"}</span>
        <div className="flex min-w-0 flex-1 items-center gap-2 max-sm:basis-full max-sm:order-last">
          {ev && <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT[ev.category])} />}
          <p className="truncate text-xs text-foreground">{ev ? ev.label : "No history yet — changes you make will appear here."}</p>
          {ev && <span className="hidden shrink-0 font-mono text-[10px] text-muted-foreground sm:inline">{when(ev.at)}</span>}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index <= 0} onClick={() => onIndex(0)} aria-label="Go to start" title="Go to start"><SkipBack /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index <= 0} onClick={() => onIndex(index - 1)} aria-label="Previous step" title="Previous step"><ChevronLeft /></Button>
          <Button variant="outline" size="icon" className="h-7 w-7" disabled={!events.length} onClick={() => { if (index >= last) onIndex(0); onPlaying(!playing); }} aria-label={playing ? "Pause replay" : "Play replay"} title={playing ? "Pause" : "Play"}>{playing ? <Pause /> : <Play />}</Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index >= last} onClick={() => onIndex(index + 1)} aria-label="Next step" title="Next step"><ChevronRight /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index >= last} onClick={() => onIndex(last)} aria-label="Go to latest" title="Go to latest"><SkipForward /></Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={onClose} aria-label="Exit replay" title="Back to live canvas"><Radio className="text-success" /><span className="hidden sm:inline">Live</span><X className="sm:hidden" /></Button>
        </div>
      </div>
      <div className="relative mt-3">
        <div className="pointer-events-none absolute inset-x-2 -top-1.5 flex h-1">
          {events.map((e, i) => <span key={e.id} className={cn("h-1 flex-1 rounded-full mx-px opacity-70", DOT[e.category], i > index && "opacity-20")} />)}
        </div>
        <Slider value={[Math.max(0, index)]} min={0} max={Math.max(0, last)} step={1} disabled={events.length < 2} onValueChange={([v]) => { onPlaying(false); onIndex(v ?? 0); }} aria-label="Timeline position" className="mt-2" />
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        {LEGEND.map(([c, l]) => <span key={c} className="flex items-center gap-1.5"><span className={cn("h-1.5 w-1.5 rounded-full", DOT[c])} />{l}</span>)}
        <span className="ml-auto hidden sm:inline">Read-only view · ← → to step</span>
      </div>
    </div>
  );
}
