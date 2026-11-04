import { Droplets } from "lucide-react";

export default function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 ${inverse ? "text-white" : "text-foreground"}`}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-teal-400/30 bg-teal-500/15 text-teal-500">
        <Droplets className="h-6 w-6" strokeWidth={1.7} />
      </div>
      <div>
        <span className="block text-xl font-bold tracking-tight">
          NoRush<span className="text-teal-500">.</span>
        </span>
        <span
          className={`block text-[9px] font-semibold uppercase tracking-[0.24em] ${inverse ? "text-slate-400" : "text-muted-foreground"}`}
        >
          Remote Tank Gauging
        </span>
      </div>
    </div>
  );
}
