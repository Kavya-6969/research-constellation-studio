import { Check, Minus, Network } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const ROWS: { topic: string; tabs: string; graph: string }[] = [
  { topic: "Context", tabs: "Papers, datasets and repos scattered across dozens of browser tabs.", graph: "Every artifact sits on one canvas with its relationships visible." },
  { topic: "Synthesis", tabs: "You copy, paste and summarise by hand.", graph: "A team of specialist agents proposes summaries and links." },
  { topic: "Control", tabs: "Automation is all-or-nothing, or absent.", graph: "Each agent action waits for your Approve / Reject." },
  { topic: "Experiments", tabs: "Results live in separate notebooks and spreadsheets.", graph: "What-if predictions sit next to the sources they came from." },
  { topic: "Memory", tabs: "Closed tabs and browser history lose the thread.", graph: "Replay how the map grew, step by step." },
  { topic: "Offline", tabs: "No connection means no work.", graph: "Edits are kept on this device and sync when you reconnect." },
  { topic: "Sharing", tabs: "Links to tabs and loose documents.", graph: "Export the whole map as structured Markdown or JSON." },
];

export default function WhyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="text-left">
          <span className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-primary"><Network className="h-3.5 w-3.5" />Comparison</span>
          <DialogTitle>Why ResearchGraph?</DialogTitle>
          <DialogDescription>A multi-agent visual graph versus traditional tab-heavy research tools.</DialogDescription>
        </DialogHeader>
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="grid grid-cols-[6rem_1fr_1fr] border-b border-border bg-secondary/40 text-[10px] font-medium uppercase tracking-wider text-muted-foreground max-sm:hidden">
            <span className="p-2.5" /><span className="p-2.5">Tab-heavy tools</span><span className="p-2.5 text-primary">ResearchGraph</span>
          </div>
          {ROWS.map((r) => (
            <div key={r.topic} className="grid border-b border-border last:border-b-0 sm:grid-cols-[6rem_1fr_1fr]">
              <span className="p-2.5 text-xs font-medium text-foreground max-sm:pb-0">{r.topic}</span>
              <p className="flex gap-2 p-2.5 text-xs text-muted-foreground max-sm:pb-1"><Minus className="mt-0.5 h-3 w-3 shrink-0" /><span><span className="sm:hidden">Tabs: </span>{r.tabs}</span></p>
              <p className="flex gap-2 p-2.5 text-xs text-foreground"><Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" />{r.graph}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">Experiment numbers on the canvas are mock predictions, not measured results.</p>
      </DialogContent>
    </Dialog>
  );
}
