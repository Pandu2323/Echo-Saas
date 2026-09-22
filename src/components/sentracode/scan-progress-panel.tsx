"use client";

import { useEffect, useRef } from "react";
import {
  Loader2, CheckCircle2, XCircle,
  ShieldAlert, FileCode, AlertTriangle,
  Shield, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScanProgress } from "@/hooks/use-scan-progress";

interface Props {
  progress: ScanProgress;
  repoName: string;
  onClose:  () => void;
}

function ProgressRing({ pct, size = 80 }: { pct: number; size?: number }) {
  const r    = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={6}
      />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke={pct === 100 ? "#10B981" : "#7C3AED"}
        strokeWidth={6}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.5s ease" }}
      />
    </svg>
  );
}

const SCAN_STEPS = [
  { label: "Connecting to GitHub",       pct: 5  },
  { label: "Fetching repository tree",   pct: 15 },
  { label: "Reading source files",       pct: 30 },
  { label: "Running AI security scan",   pct: 60 },
  { label: "Analysing vulnerabilities",  pct: 80 },
  { label: "Saving findings to database",pct: 90 },
  { label: "Computing risk score",       pct: 95 },
  { label: "Scan complete",              pct: 100 },
];

function getCurrentStep(filesScanned: number, status: string) {
  if (status === "completed") return SCAN_STEPS.length - 1;
  if (status === "failed")    return -1;
  if (filesScanned === 0)     return 1;
  if (filesScanned < 5)       return 2;
  if (filesScanned < 15)      return 3;
  if (filesScanned < 25)      return 4;
  return 5;
}

export function ScanProgressPanel({ progress, repoName, onClose }: Props) {
  const { status, filesScanned, findingsCount, criticals, warnings, duration, error } = progress;

  const estimatedTotal = 30; // cap at 30 files
  const filePct = status === "completed"
    ? 100
    : Math.min(95, Math.round((filesScanned / estimatedTotal) * 100));

  const currentStep = getCurrentStep(filesScanned, status);

  const isScanning  = status === "scanning";
  const isCompleted = status === "completed";
  const isFailed    = status === "failed";

  // pulse animation ref
  const pulseRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className="overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
      style={{
        background: "linear-gradient(135deg, rgba(13,13,18,0.98) 0%, rgba(20,14,35,0.98) 100%)",
      }}
    >
      {/* header */}
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            isCompleted ? "bg-emerald-500/15" :
            isFailed    ? "bg-red-500/15"     : "bg-primary/15"
          )}>
            {isScanning  && <ShieldAlert className="h-4 w-4 text-primary" />}
            {isCompleted && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
            {isFailed    && <XCircle      className="h-4 w-4 text-red-400"     />}
          </div>
          <div>
            <p className="text-[13px] font-semibold text-white">
              {isScanning  ? "AI Security Scan Running"  :
               isCompleted ? "Scan Complete"             :
               isFailed    ? "Scan Failed"               : "Starting scan…"}
            </p>
            <p className="text-[11px] text-white/30">{repoName}</p>
          </div>
        </div>
        {(isCompleted || isFailed) && (
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-white/40 hover:bg-white/5 transition-colors"
          >
            Dismiss
          </button>
        )}
      </div>

      {/* body */}
      <div className="p-5">
        {/* progress ring + stats */}
        <div className="flex items-center gap-6">
          <div className="relative flex items-center justify-center">
            <ProgressRing pct={filePct} size={88} />
            <div className="absolute flex flex-col items-center">
              <span className="text-lg font-bold text-white">{filePct}%</span>
            </div>
          </div>

          <div className="flex-1 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/5 bg-white/[0.025] p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <FileCode className="h-3.5 w-3.5 text-white/25" />
                <p className="text-[10.5px] text-white/30">Files scanned</p>
              </div>
              <p className="text-xl font-semibold text-white">
                {filesScanned}
                {isScanning && (
                  <span className="ml-1 text-[11px] font-normal text-white/20">/ ~{estimatedTotal}</span>
                )}
              </p>
            </div>

            <div className="rounded-xl border border-white/5 bg-white/[0.025] p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle className="h-3.5 w-3.5 text-white/25" />
                <p className="text-[10.5px] text-white/30">Findings</p>
              </div>
              <p className="text-xl font-semibold text-white">{findingsCount}</p>
            </div>

            <div className="rounded-xl border border-red-500/15 bg-red-500/5 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Shield className="h-3.5 w-3.5 text-red-400/60" />
                <p className="text-[10.5px] text-red-400/60">Critical</p>
              </div>
              <p className={cn("text-xl font-semibold", criticals > 0 ? "text-red-400" : "text-white/30")}>
                {criticals}
              </p>
            </div>

            <div className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Zap className="h-3.5 w-3.5 text-amber-400/60" />
                <p className="text-[10.5px] text-amber-400/60">Warning</p>
              </div>
              <p className={cn("text-xl font-semibold", warnings > 0 ? "text-amber-400" : "text-white/30")}>
                {warnings}
              </p>
            </div>
          </div>
        </div>

        {/* step progress */}
        {(isScanning || isCompleted) && (
          <div className="mt-4 space-y-1.5">
            {SCAN_STEPS.slice(0, currentStep + 2).map((step, i) => {
              const isDone    = i < currentStep;
              const isCurrent = i === currentStep && isScanning;

              return (
                <div key={step.label} className="flex items-center gap-2.5">
                  <div className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                    isDone    ? "bg-emerald-500/20"  :
                    isCurrent ? "bg-primary/20"       : "bg-white/5"
                  )}>
                    {isDone ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                    ) : isCurrent ? (
                      <Loader2 className="h-3 w-3 animate-spin text-primary" />
                    ) : (
                      <div className="h-1.5 w-1.5 rounded-full bg-white/10" />
                    )}
                  </div>
                  <p className={cn(
                    "text-[11.5px] transition-colors",
                    isDone    ? "text-white/40"  :
                    isCurrent ? "text-white/80"  : "text-white/15"
                  )}>
                    {step.label}
                    {isCurrent && isScanning && (
                      <span className="ml-2 animate-pulse text-primary">…</span>
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* progress bar */}
        {isScanning && (
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-primary transition-all duration-700"
              style={{ width: `${filePct}%` }}
            />
          </div>
        )}

        {/* completed result */}
        {isCompleted && (
          <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <div>
                <p className="text-[12.5px] font-medium text-emerald-400">
                  Scan completed {duration ? `in ${duration}s` : ""}
                </p>
                <p className="text-[11px] text-emerald-400/60">
                  {findingsCount === 0
                    ? "No security issues found — your code looks clean."
                    : `Found ${findingsCount} issue${findingsCount !== 1 ? "s" : ""}: ${criticals} critical, ${warnings} warning. View in Vulnerabilities tab.`}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* failed result */}
        {isFailed && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-3">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 shrink-0 text-red-400" />
              <div>
                <p className="text-[12.5px] font-medium text-red-400">Scan failed</p>
                <p className="text-[11px] text-red-400/60">
                  {error ?? "An unexpected error occurred. Check your GitHub token in Settings."}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}