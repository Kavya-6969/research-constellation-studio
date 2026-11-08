import { FlaskConical, RotateCcw, Target, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { createExperiment, experimentDeltas, simulateExperiment, type Experiment, type Parameters } from "@/lib/experiments";

const fields: { key: keyof Parameters; label: string; min: number; max: number; step: number; log?: boolean }[] = [
  { key: "learningRate", label: "Learning rate", min: 0.00001, max: 0.1, step: 0.00001, log: true },
  { key: "batchSize", label: "Batch size", min: 1, max: 256, step: 1 },
  { key: "layers", label: "Model layers", min: 1, max: 24, step: 1 },
];
const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}`;
export default function ExperimentPanel({ title, experiment, onChange, onClose }: {
  title: string; experiment: Experiment; onChange: (experiment: Experiment) => void; onClose: () => void;
}) {
  const delta = experimentDeltas(experiment);
  const metrics = simulateExperiment(experiment.parameters);
  const baseline = simulateExperiment(experiment.baseline);
  const update = (key: keyof Parameters, value: number) => onChange(createExperiment({ ...experiment.parameters, [key]: value }, experiment.baseline));
  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="pr-6 text-left">
          <span className="flex items-center gap-2 text-xs text-node-experiment"><FlaskConical className="h-4 w-4" />EXPERIMENT · WHAT-IF</span>
          <SheetTitle className="break-words">{title}</SheetTitle>
          <SheetDescription>Mock simulation · not measured results</SheetDescription>
        </SheetHeader>
        <section className="mt-8 space-y-7">
          {fields.map((field) => <div key={field.key} className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <label htmlFor={`experiment-${field.key}`} className="text-sm">{field.label}</label>
              <input id={`experiment-${field.key}`} type="number" min={field.min} max={field.max} step={field.step}
                value={experiment.parameters[field.key]}
                onChange={(event) => { if (event.target.value !== "") update(field.key, event.target.valueAsNumber); }}
                className="h-8 w-28 rounded-md border border-input bg-background px-2 text-right font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <Slider aria-label={field.label} min={field.log ? -5 : field.min} max={field.log ? -1 : field.max} step={field.log ? 0.05 : field.step}
              value={[field.log ? Math.log10(experiment.parameters[field.key]) : experiment.parameters[field.key]]}
              onValueChange={([value]) => { if (value !== undefined) update(field.key, field.log ? Number((10 ** value).toPrecision(4)) : value); }} />
            <div className="flex justify-between font-mono text-[10px] text-muted-foreground"><span>{field.min}</span><span>{field.max}</span></div>
          </div>)}
        </section>
        <section className="mt-8 border-t border-border pt-5" aria-live="polite">
          <h3 className="mb-4 text-xs font-medium text-muted-foreground">PREDICTED PERFORMANCE</h3>
          <div className="grid grid-cols-2 gap-5">
            <div className="min-w-0"><span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Target className="h-3.5 w-3.5" />Accuracy</span>
              <p data-testid="predicted-accuracy" className="mt-2 font-mono text-2xl">{metrics.accuracy.toFixed(2)}%</p>
              <p className={delta.accuracy >= 0 ? "text-sm text-success" : "text-sm text-destructive"}>{signed(delta.accuracy)} pp</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Baseline {baseline.accuracy}%</p></div>
            <div className="min-w-0"><span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Timer className="h-3.5 w-3.5" />Latency</span>
              <p data-testid="predicted-latency" className="mt-2 font-mono text-2xl">{metrics.latencyMs.toFixed(1)}<span className="ml-1 text-xs">ms</span></p>
              <p className={delta.latencyMs <= 0 ? "text-sm text-success" : "text-sm text-destructive"}>{signed(delta.latencyMs)} ms</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Baseline {baseline.latencyMs} ms</p></div>
          </div>
        </section>
        <div className="mt-8 flex flex-wrap gap-2 border-t border-border pt-5">
          <Button variant="outline" size="sm" onClick={() => onChange(createExperiment(experiment.baseline, experiment.baseline))}><RotateCcw />Reset parameters</Button>
          <Button variant="secondary" size="sm" onClick={() => onChange(createExperiment(experiment.parameters, experiment.parameters))}>Set baseline</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}