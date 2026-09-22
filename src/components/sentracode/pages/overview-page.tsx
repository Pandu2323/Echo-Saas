/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { StatCard, SBadge, DiffBlock, Card, CardHead } from "../sentra-ui";
import {
  ArrowRight, Server, AlertTriangle,
  CheckCheck, ShieldCheck, Loader2,
  Play, RefreshCw, GitBranch,
} from "lucide-react";
import { useWorkspace } from "@/lib/workspace-context";
import { useScanProgress } from "@/hooks/use-scan-progress";
import { ScanProgressPanel } from "../scan-progress-panel";

interface Finding {
  id:         string;
  severity:   "CRITICAL" | "WARNING" | "INFO";
  title:      string;
  filePath:   string;
  createdAt:  string;
  diffBefore: string | null;
  diffAfter:  string | null;
  cwe:        string | null;
  lineNumber: number | null;
  repo: { fullName: string };
}

interface Repo {
  id:          string;
  fullName:    string;
  riskScore:   string | null;
  scanStatus:  string;
  isPrivate:   boolean;
  findings:    { severity: string }[];
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m    = Math.floor(diff / 60000);
  const h    = Math.floor(m / 60);
  const d    = Math.floor(h / 24);
  if (d > 0)  return `${d}d ago`;
  if (h > 0)  return `${h}h ago`;
  if (m > 0)  return `${m}m ago`;
  return "just now";
}

export function OverviewPage({ onNavigate }: { onNavigate: (p: any) => void }) {
  const { workspaceId }    = useWorkspace();
  const langRef            = useRef<HTMLCanvasElement>(null);
  const chartInited        = useRef(false);
  const chartInstance      = useRef<any>(null);
  const pollRef            = useRef<ReturnType<typeof setInterval> | null>(null);

  const [findings,      setFindings     ] = useState<Finding[]>([]);
  const [repos,         setRepos        ] = useState<Repo[]>([]);
  const [loading,       setLoading      ] = useState(true);
  const [scanningRepoId,setScanningRepoId] = useState<string | null>(null);
  const [scanningRepo,  setScanningRepo ] = useState<Repo | null>(null);

  const { progress, startScan, reset: resetScan } = useScanProgress();

  const fetchData = useCallback(async (silent = false) => {
    if (!workspaceId) return;
    if (!silent) setLoading(true);
    try {
      const [fRes, rRes] = await Promise.all([
        fetch(`/api/sentra/findings?workspaceId=${workspaceId}`),
        fetch(`/api/sentra/repos?workspaceId=${workspaceId}`),
      ]);
      const fData = await fRes.json();
      const rData = await rRes.json();
      setFindings(fData.findings ?? []);
      setRepos(rData.repos ?? []);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { fetchData(false); }, [fetchData]);

  // after scan completes refresh data
  useEffect(() => {
    if (progress.status === "completed" || progress.status === "failed") {
      fetchData(true);
    }
  }, [progress.status, fetchData]);

  // real-time polling while scan is running
  useEffect(() => {
    if (progress.status === "scanning") {
      pollRef.current = setInterval(() => fetchData(true), 5000);
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [progress.status, fetchData]);

  const handleScan = async (repo: Repo) => {
    if (!workspaceId) return;
    setScanningRepoId(repo.id);
    setScanningRepo(repo);
    await startScan(repo.id, workspaceId);
  };

  const handleDismissScan = () => {
    resetScan();
    setScanningRepoId(null);
    setScanningRepo(null);
  };

  // language donut — build from real repo languages
  useEffect(() => {
    if (!langRef.current || repos.length === 0) return;

    const allLangs: Record<string, number> = {};
    for (const repo of repos) {
      const langs = (repo as any).languages as Record<string, number> | null;
      if (langs) {
        for (const [lang, bytes] of Object.entries(langs)) {
          allLangs[lang] = (allLangs[lang] ?? 0) + bytes;
        }
      }
    }

    const COLORS = ["#378ADD","#BA7517","#8B5CF6","#D85A30","#5F5E5A","#639922"];
    const total  = Object.values(allLangs).reduce((s, v) => s + v, 0);

    const sorted = Object.entries(allLangs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    if (sorted.length === 0) return;

    import("chart.js/auto").then(({ default: Chart }) => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
        chartInited.current   = false;
      }
      if (!langRef.current) return;

      chartInstance.current = new Chart(langRef.current, {
        type: "doughnut",
        data: {
          labels:   sorted.map(([lang]) => lang),
          datasets: [{
            data:            sorted.map(([, b]) => total > 0 ? Math.round(b / total * 100) : 0),
            backgroundColor: COLORS.slice(0, sorted.length),
            borderWidth:     0,
          }],
        },
        options: {
          cutout: "65%",
          plugins: {
            legend: {
              position: "right",
              labels: {
                boxWidth: 8, boxHeight: 8, padding: 10,
                color:    "rgba(255,255,255,0.4)",
                font:     { size: 11 },
              },
            },
          },
        },
      });
      chartInited.current = true;
    });
  }, [repos]);

  // derived stats
  const criticals   = findings.filter(f => f.severity === "CRITICAL").length;
  const autoFixed   = findings.filter(f => (f as any).autoFixed).length;
  const scanned     = repos.filter(r => r.scanStatus === "COMPLETED").length;
  const topRisk     = repos.find(r => r.riskScore)?.riskScore ?? "N/A";
  const recentFinds = findings.slice(0, 4);
  const topFinding  = findings.find(f => f.diffBefore || f.diffAfter);

  const sevBadge = (sev: string) => {
    if (sev === "CRITICAL") return <SBadge sev="Critical"><AlertTriangle className="h-2.5 w-2.5" />Critical</SBadge>;
    if (sev === "WARNING")  return <SBadge sev="Warning"><AlertTriangle className="h-2.5 w-2.5" />Warning</SBadge>;
    return <SBadge sev="Info">Info</SBadge>;
  };

  return (
    <div className="p-6 space-y-5">
      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Overview</h1>
          <p className="text-[12px] text-white/30 mt-0.5">
            Security posture across all connected repositories
          </p>
        </div>
        <button
          onClick={() => fetchData(true)}
          className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/30 hover:bg-white/8 hover:text-white/60 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* SCAN PROGRESS PANEL — shown when scan is running or just completed */}
      {(progress.status === "scanning" ||
        progress.status === "completed" ||
        progress.status === "failed") && scanningRepo && (
        <ScanProgressPanel
          progress={progress}
          repoName={scanningRepo.fullName}
          onClose={handleDismissScan}
        />
      )}

      {/* stat cards */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard
          label="Repos scanned"
          value={loading ? "…" : scanned}
          trend={repos.length > 0 ? `of ${repos.length} connected` : undefined}
          trendDir="up"
          icon={<Server className="h-3.5 w-3.5 text-blue-400" />}
        />
        <StatCard
          label="Critical findings"
          value={loading ? "…" : criticals}
          valueColor={criticals > 0 ? "text-red-400" : undefined}
          icon={<AlertTriangle className="h-3.5 w-3.5 text-red-400" />}
        />
        <StatCard
          label="Auto-fixed"
          value={loading ? "…" : autoFixed}
          valueColor="text-emerald-400"
          icon={<CheckCheck className="h-3.5 w-3.5 text-emerald-400" />}
        />
        <StatCard
          label="Risk score"
          value={loading ? "…" : topRisk}
          icon={<ShieldCheck className="h-3.5 w-3.5 text-primary" />}
        />
      </div>

      {/* quick scan launcher */}
      {repos.length > 0 && progress.status === "idle" && (
        <Card>
          <CardHead
            title="Quick scan"
            sub="Run an AI security scan on any connected repository"
          />
          <div className="flex flex-wrap gap-2">
            {repos.map(repo => (
              <button
                key={repo.id}
                onClick={() => handleScan(repo)}
                disabled={!!scanningRepoId || repo.scanStatus === "SCANNING"}
                className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2 text-[12px] text-white/50 transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {repo.scanStatus === "SCANNING" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                <GitBranch className="h-3 w-3 opacity-60" />
                <span className="max-w-[160px] truncate">{repo.fullName}</span>
                {repo.riskScore && (
                  <span className={`text-[10px] font-medium ${
                    repo.riskScore.startsWith("A") ? "text-emerald-400" :
                    repo.riskScore.startsWith("B") ? "text-amber-400"   : "text-red-400"
                  }`}>
                    {repo.riskScore}
                  </span>
                )}
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* no repos state */}
      {repos.length === 0 && !loading && (
        <Card>
          <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/5 bg-white/[0.02]">
              <GitBranch className="h-5 w-5 text-white/15" />
            </div>
            <p className="text-sm text-white/30">No repositories connected</p>
            <p className="text-[11.5px] text-white/15">
              Go to Repositories and connect a GitHub repo to start scanning
            </p>
            <button
              onClick={() => onNavigate("repositories")}
              className="mt-1 flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary/90 transition-colors"
            >
              <GitBranch className="h-3.5 w-3.5" />Connect first repo
            </button>
          </div>
        </Card>
      )}

      {/* recent findings + donut */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="col-span-2">
          <CardHead
            title="Recent findings"
            sub="Across all repositories"
            action={
              <button
                onClick={() => onNavigate("vulnerabilities")}
                className="flex items-center gap-1 text-[11.5px] text-primary hover:underline"
              >
                View all <ArrowRight className="h-3 w-3" />
              </button>
            }
          />
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-white/20" />
            </div>
          ) : recentFinds.length === 0 ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-[12px] text-white/20">
                {repos.length === 0
                  ? "Connect and scan a repository to see findings here"
                  : "No findings yet — click a repo above to scan it"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {recentFinds.map(f => (
                <div key={f.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    {sevBadge(f.severity)}
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] text-white/70">{f.title}</p>
                      <p className="text-[11px] text-white/25">{f.repo.fullName}</p>
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] text-white/25">{timeAgo(f.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHead title="Language exposure" />
          {repos.length === 0 || !repos.some(r => (r as any).languages) ? (
            <div className="flex h-40 items-center justify-center">
              <p className="text-[11.5px] text-white/20 text-center">
                Connect repositories to see language distribution
              </p>
            </div>
          ) : (
            <canvas ref={langRef} height={160} />
          )}
        </Card>
      </div>

      {/* AI diff review — top finding */}
      <Card>
        <CardHead
          title={topFinding
            ? `AI review · ${topFinding.filePath}`
            : "AI security review"}
          sub={topFinding?.repo.fullName ?? "No findings yet"}
          action={topFinding
            ? <SBadge sev="Critical"><AlertTriangle className="h-3 w-3" />Critical issue</SBadge>
            : undefined}
        />
        {topFinding && (topFinding.diffBefore || topFinding.diffAfter) ? (
          <DiffBlock
            file={`${topFinding.filePath}${topFinding.lineNumber ? `:${topFinding.lineNumber}` : ""}${topFinding.cwe ? ` · ${topFinding.cwe}` : ""}`}
            lines={[
              ...(topFinding.diffBefore
                ? topFinding.diffBefore.split("\n").map(t => ({ type: "-" as const, text: t }))
                : []),
              ...(topFinding.diffAfter
                ? topFinding.diffAfter.split("\n").map(t => ({ type: "+" as const, text: t }))
                : []),
            ]}
          />
        ) : (
          <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-white/8">
            <p className="text-[12px] text-white/20">
              {findings.length === 0
                ? "Scan a repository to see AI-generated security fixes here"
                : "No diff available for recent findings"}
            </p>
          </div>
        )}
      </Card>

      {/* repo health grid */}
      {repos.filter(r => r.scanStatus === "COMPLETED").length > 0 && (
        <Card>
          <CardHead
            title="Repository health"
            sub="Risk scores across scanned repos"
          />
          <div className="grid grid-cols-3 gap-3">
            {repos.filter(r => r.scanStatus === "COMPLETED").map(repo => {
              const repoCriticals = repo.findings.filter(f => f.severity === "CRITICAL").length;
              const repoWarnings  = repo.findings.filter(f => f.severity === "WARNING").length;

              return (
                <div
                  key={repo.id}
                  className="rounded-xl border border-white/5 bg-white/[0.02] p-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[12px] font-medium text-white/70 truncate">
                      {repo.fullName.split("/")[1]}
                    </p>
                    {repo.riskScore && (
                      <span className={`text-[13px] font-bold ${
                        repo.riskScore.startsWith("A") ? "text-emerald-400" :
                        repo.riskScore.startsWith("B") ? "text-amber-400"   : "text-red-400"
                      }`}>
                        {repo.riskScore}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {repoCriticals > 0 && (
                      <span className="text-[10.5px] text-red-400">{repoCriticals} critical</span>
                    )}
                    {repoWarnings  > 0 && (
                      <span className="text-[10.5px] text-amber-400">{repoWarnings} warning</span>
                    )}
                    {repoCriticals === 0 && repoWarnings === 0 && (
                      <span className="text-[10.5px] text-emerald-400">Clean</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}