/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { StatCard, SBadge, DiffBlock, Card, CardHead } from "../sentra-ui";
import {
  ArrowRight, Server, AlertTriangle,
  CheckCheck, ShieldCheck, Loader2,
} from "lucide-react";
import { useWorkspace } from "@/lib/workspace-context";

interface Finding {
  id:        string;
  severity:  "CRITICAL" | "WARNING" | "INFO";
  title:     string;
  filePath:  string;
  createdAt: string;
  diffBefore:string | null;
  diffAfter: string | null;
  cwe:       string | null;
  lineNumber:number | null;
  repo: { fullName: string };
}

interface Repo {
  id:        string;
  riskScore: string | null;
  scanStatus:string;
  findings:  { severity: string }[];
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m    = Math.floor(diff / 60000);
  const h    = Math.floor(m / 60);
  const d    = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "just now";
}

export function OverviewPage({ onNavigate }: { onNavigate: (p: any) => void }) {
  const { workspaceId } = useWorkspace();
  const langRef   = useRef<HTMLCanvasElement>(null);
  const chartInited = useRef(false);

  const [findings, setFindings] = useState<Finding[]>([]);
  const [repos,    setRepos   ] = useState<Repo[]>([]);
  const [loading,  setLoading ] = useState(true);

  const fetchData = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
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
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // compute stats
  const criticals   = findings.filter(f => f.severity === "CRITICAL").length;
  const autoFixed   = findings.filter(f => (f as any).autoFixed).length;
  const scanned     = repos.filter(r => r.scanStatus === "COMPLETED").length;
  const avgRisk     = repos.find(r => r.riskScore)?.riskScore ?? "N/A";
  const recentFinds = findings.slice(0, 4);
  const topFinding  = findings.find(f => f.diffBefore || f.diffAfter);

  // language chart
  useEffect(() => {
    if (chartInited.current || !langRef.current || repos.length === 0) return;
    chartInited.current = true;
    import("chart.js/auto").then(({ default: Chart }) => {
      new Chart(langRef.current!, {
        type: "doughnut",
        data: {
          labels:   ["TypeScript","Python","CSS","HTML","Other"],
          datasets: [{
            data:            [42, 35, 10, 8, 5],
            backgroundColor: ["#378ADD","#BA7517","#8B5CF6","#D85A30","#5F5E5A"],
            borderWidth:     0,
          }],
        },
        options: {
          cutout: "65%",
          plugins: {
            legend: {
              position: "right",
              labels: { boxWidth: 8, boxHeight: 8, padding: 10, color: "rgba(255,255,255,0.4)", font: { size: 11 } },
            },
          },
        },
      });
    });
  }, [repos]);

  const sevBadge = (sev: string) => {
    if (sev === "CRITICAL") return <SBadge sev="Critical"><AlertTriangle className="h-2.5 w-2.5" />Critical</SBadge>;
    if (sev === "WARNING")  return <SBadge sev="Warning"><AlertTriangle className="h-2.5 w-2.5" />Warning</SBadge>;
    return <SBadge sev="Info">Info</SBadge>;
  };

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-white">Overview</h1>
        <p className="text-[12px] text-white/30 mt-0.5">Security posture across all connected repositories</p>
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Repos scanned"    value={loading ? "…" : scanned} trend={scanned > 0 ? `of ${repos.length} connected` : undefined} trendDir="up"
          icon={<Server className="h-3.5 w-3.5 text-blue-400" />} />
        <StatCard label="Critical findings" value={loading ? "…" : criticals} valueColor={criticals > 0 ? "text-red-400" : undefined}
          icon={<AlertTriangle className="h-3.5 w-3.5 text-red-400" />} />
        <StatCard label="Auto-fixed"  value={loading ? "…" : autoFixed} valueColor="text-emerald-400"
          icon={<CheckCheck className="h-3.5 w-3.5 text-emerald-400" />} />
        <StatCard label="Risk score"  value={loading ? "…" : avgRisk}
          icon={<ShieldCheck className="h-3.5 w-3.5 text-primary" />} />
      </div>

      {/* findings + donut */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="col-span-2">
          <CardHead
            title="Recent findings"
            sub="Across all repositories"
            action={
              <button onClick={() => onNavigate("vulnerabilities")}
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
                No findings yet — connect and scan a repository
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
          {repos.length === 0 ? (
            <div className="flex h-40 items-center justify-center">
              <p className="text-[11.5px] text-white/20 text-center">Connect repositories to see language distribution</p>
            </div>
          ) : (
            <canvas ref={langRef} height={160} />
          )}
        </Card>
      </div>

      {/* AI diff review */}
      <Card>
        <CardHead
          title={topFinding ? `AI review · ${topFinding.filePath}` : "AI review"}
          sub={topFinding?.repo.fullName ?? "No findings yet"}
          action={topFinding ? <SBadge sev="Critical"><AlertTriangle className="h-3 w-3" />Critical issue</SBadge> : undefined}
        />
        {topFinding && (topFinding.diffBefore || topFinding.diffAfter) ? (
          <DiffBlock
            file={`${topFinding.filePath}${topFinding.lineNumber ? `:${topFinding.lineNumber}` : ""}${topFinding.cwe ? ` · ${topFinding.cwe}` : ""}`}
            lines={[
              ...(topFinding.diffBefore ? topFinding.diffBefore.split("\n").map(t => ({ type: "-" as const, text: t })) : []),
              ...(topFinding.diffAfter  ? topFinding.diffAfter.split("\n").map(t => ({ type: "+" as const, text: t })) : []),
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
    </div>
  );
}