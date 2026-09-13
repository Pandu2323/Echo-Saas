import { cn } from "@/lib/utils";
import {
  ArrowUpRight, ArrowDownRight,
} from "lucide-react";

/* ── stat card ──────────────────────────────────────────────────────── */
export function StatCard({
  label, value, trend, trendDir, icon, valueColor,
}: {
  label: string; value: string | number;
  trend?: string; trendDir?: "up" | "down";
  icon?: React.ReactNode; valueColor?: string;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.025] p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11.5px] text-white/40">{label}</p>
        {icon && (
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5">
            {icon}
          </div>
        )}
      </div>
      <p className={cn("mt-2 text-2xl font-semibold", valueColor ?? "text-white")}>
        {value}
      </p>
      {trend && (
        <div className={cn(
          "mt-1 flex items-center gap-1 text-[11px]",
          trendDir === "up" ? "text-emerald-400" : "text-red-400"
        )}>
          {trendDir === "up"
            ? <ArrowUpRight className="h-3 w-3" />
            : <ArrowDownRight className="h-3 w-3" />}
          {trend}
        </div>
      )}
    </div>
  );
}

/* ── severity badge ─────────────────────────────────────────────────── */
type Severity = "Critical" | "Warning" | "Info" | "Success" | "Neutral";
const SEV_STYLES: Record<Severity, string> = {
  Critical: "bg-red-500/10 text-red-400 border-red-500/20",
  Warning:  "bg-amber-500/10 text-amber-400 border-amber-500/20",
  Info:     "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Success:  "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Neutral:  "bg-white/5 text-white/40 border-white/10",
};

export function SBadge({ sev, children }: { sev: Severity; children: React.ReactNode }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10.5px] font-medium",
      SEV_STYLES[sev]
    )}>
      {children}
    </span>
  );
}

/* ── diff block ─────────────────────────────────────────────────────── */
export function DiffBlock({ file, lines }: { file: string; lines: { type: "+" | "-" | " " | "meta"; text: string }[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-white/8 bg-black/30 p-3 font-mono text-[11.5px] leading-relaxed">
      <p className="mb-1.5 text-white/25">{file}</p>
      {lines.map((l, i) => (
        <div
          key={i}
          className={cn(
            l.type === "+" && "text-emerald-400",
            l.type === "-" && "text-red-400",
            l.type === " " && "text-white/50",
            l.type === "meta" && "text-white/20",
          )}
        >
          {l.text}
        </div>
      ))}
    </div>
  );
}

/* ── card ───────────────────────────────────────────────────────────── */
export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-white/5 bg-white/[0.025] p-4", className)}>
      {children}
    </div>
  );
}

export function CardHead({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between">
      <div>
        <h3 className="text-[13px] font-medium text-white">{title}</h3>
        {sub && <p className="mt-0.5 text-[11.5px] text-white/30">{sub}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}