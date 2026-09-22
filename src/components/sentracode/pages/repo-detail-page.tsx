/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { StatCard, Card, CardHead, SBadge } from "../sentra-ui";
import {
  ArrowRight, RefreshCw, Loader2,
  GitCommit, Calendar, FileCode,
  TrendingUp, AlertTriangle,
} from "lucide-react";
import { useWorkspace } from "@/lib/workspace-context";

interface Commit {
  id:           string;
  sha:          string;
  message:      string;
  authorName:   string;
  authorEmail:  string;
  branch:       string;
  additions:    number;
  deletions:    number;
  filesChanged: number;
  committedAt:  string;
}

interface Contributor {
  name:      string;
  email:     string;
  commits:   number;
  additions: number;
  deletions: number;
  pct:       number;
}

interface DailyData {
  date:  string;
  label: string;
  count: number;
}

interface Stats {
  totalCommits:    number;
  totalAdditions:  number;
  totalDeletions:  number;
  totalFiles:      number;
  activeDaysCount: number;
  avgPerDay:       string;
  streak:          number;
  lastCommit:      string | null;
  contributors:    Contributor[];
  daily:           DailyData[];
  languages:       Record<string, number> | null;
  riskScore:       string | null;
  fullName:        string;
  description:     string | null;
  isPrivate:       boolean;
}

const AVATAR_COLORS = [
  "#378ADD","#8B5CF6","#BA7517","#639922",
  "#D85A30","#0891B2","#DB2777","#059669",
];

function colorForName(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function initials(name: string) {
  return name.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2);
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

function CommitBarChart({ daily }: { daily: DailyData[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // const inited    = useRef(false);
  const chartRef  = useRef<any>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    import("chart.js/auto").then(({ default: Chart }) => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }

      chartRef.current = new Chart(canvasRef.current!, {
        type: "bar",
        data: {
          labels:   daily.map(d => d.label),
          datasets: [{
            data:            daily.map(d => d.count),
            backgroundColor: "#378ADD",
            borderRadius:    4,
            maxBarThickness: 24,
          }],
        },
        options: {
          responsive: true,
          plugins:    { legend: { display: false } },
          scales: {
            x: {
              grid:   { display: false },
              border: { color: "rgba(255,255,255,0.05)" },
              ticks:  { color: "rgba(255,255,255,0.3)", font: { size: 10 } },
            },
            y: {
              grid:   { color: "rgba(255,255,255,0.04)" },
              border: { display: false },
              ticks:  { color: "rgba(255,255,255,0.3)", font: { size: 10 }, stepSize: 1 },
              min: 0,
            },
          },
        },
      });
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [daily]);

  return <canvas ref={canvasRef} height={130} />;
}

function LangDonutChart({ languages }: { languages: Record<string, number> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef  = useRef<any>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const total   = Object.values(languages).reduce((s, v) => s + v, 0);
    const entries = Object.entries(languages)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    const COLORS = ["#378ADD","#BA7517","#8B5CF6","#D85A30","#5F5E5A","#639922"];

    import("chart.js/auto").then(({ default: Chart }) => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }

      chartRef.current = new Chart(canvasRef.current!, {
        type: "doughnut",
        data: {
          labels:   entries.map(([lang]) => lang),
          datasets: [{
            data:            entries.map(([, bytes]) => Math.round(bytes / total * 100)),
            backgroundColor: COLORS,
            borderWidth:     0,
          }],
        },
        options: {
          cutout: "65%",
          plugins: {
            legend: {
              position: "right",
              labels: {
                boxWidth:  8,
                boxHeight: 8,
                padding:   10,
                color:     "rgba(255,255,255,0.4)",
                font:      { size: 11 },
              },
            },
          },
        },
      });
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [languages]);

  return <canvas ref={canvasRef} height={130} />;
}

interface Props {
  repoId?: string;
}

export function RepoDetailPage({ repoId }: Props) {
  // const { workspaceId } = useWorkspace();

  const [stats,   setStats  ] = useState<Stats | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async (refresh = false) => {
    if (!repoId) return;
    if (refresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [sRes, cRes] = await Promise.all([
        fetch(`/api/sentra/repos/${repoId}/stats`),
        fetch(`/api/sentra/repos/${repoId}/commits${refresh ? "?refresh=true" : ""}`),
      ]);

      const sData = await sRes.json();
      const cData = await cRes.json();

      setStats(sData);
      setCommits(cData.commits ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [repoId]);

  useEffect(() => { fetchAll(false); }, [fetchAll]);

  // ── No repo selected ────────────────────────────────────────────────
  if (!repoId) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/5 bg-white/[0.02]">
            <GitCommit className="h-6 w-6 text-white/15" />
          </div>
          <p className="text-sm text-white/30">Select a repository</p>
          <p className="text-[11.5px] text-white/15">
            Go to Repositories and click a repo to view commit activity
          </p>
        </div>
      </div>
    );
  }

  // ── Loading ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <p className="text-xs text-white/25">Loading commit activity…</p>
        </div>
      </div>
    );
  }

  // ── No stats found ──────────────────────────────────────────────────
  if (!stats) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-white/30">Failed to load repository data</p>
      </div>
    );
  }

  const langTotal = Object.values(stats.languages ?? {}).reduce((s, v) => s + v, 0);

  return (
    <div className="p-6 space-y-5">
      {/* header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-semibold text-white">{stats.fullName}</h1>
            <SBadge sev={stats.isPrivate ? "Neutral" : "Success"}>
              {stats.isPrivate ? "Private" : "Public"}
            </SBadge>
            {stats.riskScore && (
              <SBadge sev={
                stats.riskScore.startsWith("A") ? "Success" :
                stats.riskScore.startsWith("B") ? "Warning" : "Critical"
              }>
                Risk {stats.riskScore}
              </SBadge>
            )}
          </div>
          <p className="mt-0.5 text-[12px] text-white/30 truncate">
            {stats.description ?? "No description"} · Commit tracking · last 7 days
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/50 focus:outline-none">
            <option>Last 7 days</option>
            <option>Last 30 days</option>
            <option>Last 90 days</option>
          </select>
          <button
            onClick={() => fetchAll(true)}
            disabled={refreshing}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/40 hover:bg-white/8 disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard
          label="Total commits"
          value={stats.totalCommits}
          icon={<GitCommit className="h-3.5 w-3.5 text-primary" />}
        />
        <StatCard
          label="Active days"
          value={stats.activeDaysCount}
          icon={<Calendar className="h-3.5 w-3.5 text-primary" />}
        />
        <StatCard
          label="Files changed"
          value={stats.totalFiles.toLocaleString()}
          icon={<FileCode className="h-3.5 w-3.5 text-primary" />}
        />
        <StatCard
          label="Lines changed"
          value={`+${stats.totalAdditions.toLocaleString()}`}
          valueColor="text-emerald-400"
          icon={<TrendingUp className="h-3.5 w-3.5 text-emerald-400" />}
        />
      </div>

      {/* commit chart + language donut */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="col-span-2">
          <CardHead
            title="Commit activity"
            action={
              <div className="flex items-center gap-4 text-[11px] text-white/25">
                <span>Streak: <strong className="text-white/50">{stats.streak} days</strong></span>
                <span>Avg/day: <strong className="text-white/50">{stats.avgPerDay}</strong></span>
              </div>
            }
          />
          {stats.daily.every(d => d.count === 0) ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-[12px] text-white/20">
                No commits in the last 7 days. Click ↻ to refresh from GitHub.
              </p>
            </div>
          ) : (
            <CommitBarChart daily={stats.daily} />
          )}
        </Card>
        <Card>
          <CardHead title="Language distribution" />
          {stats.languages && langTotal > 0 ? (
            <LangDonutChart languages={stats.languages} />
          ) : (
            <div className="flex h-32 items-center justify-center">
              <p className="text-[11.5px] text-white/20 text-center">No language data. Run a scan first.</p>
            </div>
          )}
        </Card>
      </div>

      {/* recent commits + contributors */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="col-span-2">
          <CardHead
            title="Recent commits"
            action={
              <button
                onClick={() => fetchAll(true)}
                disabled={refreshing}
                className="flex items-center gap-1 text-[11.5px] text-primary hover:underline disabled:opacity-40"
              >
                Refresh <ArrowRight className="h-3 w-3" />
              </button>
            }
          />
          {commits.length === 0 ? (
            <div className="flex h-40 items-center justify-center flex-col gap-3">
              <GitCommit className="h-6 w-6 text-white/10" />
              <p className="text-[12px] text-white/20">No commits loaded</p>
              <button
                onClick={() => fetchAll(true)}
                className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-[11.5px] text-white/40 hover:bg-white/5 transition-colors"
              >
                <RefreshCw className="h-3 w-3" />Fetch from GitHub
              </button>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {commits.slice(0, 8).map(c => {
                const color = colorForName(c.authorName);
                return (
                  <div key={c.id} className="flex items-center gap-3 py-2.5">
                    <div
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                      style={{ backgroundColor: color }}
                    >
                      {initials(c.authorName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-[12.5px] text-white/70">{c.message}</p>
                      <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[10px] text-white/20">{c.sha.slice(0, 7)}</span>
                        <span className="rounded bg-white/8 px-1.5 py-0.5 text-[10px] text-white/30">{c.branch}</span>
                        <span className="text-[10px] text-white/20">{timeAgo(c.committedAt)}</span>
                        {c.filesChanged > 0 && (
                          <span className="text-[10px] text-white/20">{c.filesChanged} file{c.filesChanged !== 1 ? "s" : ""}</span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-[11.5px] text-right">
                      {c.additions > 0 && <span className="text-emerald-400">+{c.additions}</span>}
                      {c.additions > 0 && c.deletions > 0 && <span className="text-white/20"> </span>}
                      {c.deletions > 0 && <span className="text-red-400">-{c.deletions}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <CardHead title="Top contributors" />
          {stats.contributors.length === 0 ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-[11.5px] text-white/20">No contributor data yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {stats.contributors.slice(0, 6).map(c => {
                const color = colorForName(c.name);
                return (
                  <div key={c.email} className="flex items-center gap-2.5">
                    <div
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9.5px] font-semibold text-white"
                      style={{ backgroundColor: color }}
                    >
                      {initials(c.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="mb-1 flex justify-between text-[12px]">
                        <span className="text-white/60 truncate">{c.name}</span>
                        <span className="shrink-0 ml-2 text-white/25">{c.commits}</span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-white/5">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${c.pct}%`, backgroundColor: color }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* quick stats */}
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/5 pt-3">
            {[
              { label: "Last commit",   value: stats.lastCommit ? timeAgo(stats.lastCommit) : "Never" },
              { label: "Avg/day",       value: stats.avgPerDay },
              { label: "Streak",        value: `${stats.streak}d` },
            ].map(s => (
              <div key={s.label}>
                <p className="text-[10px] text-white/25">{s.label}</p>
                <p className="mt-0.5 text-[13px] font-semibold text-white">{s.value}</p>
              </div>
            ))}
          </div>

          {/* lines changed summary */}
          <div className="mt-3 border-t border-white/5 pt-3 flex gap-4">
            <div>
              <p className="text-[10px] text-white/25">Lines added</p>
              <p className="mt-0.5 text-[13px] font-semibold text-emerald-400">
                +{stats.totalAdditions.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-white/25">Lines removed</p>
              <p className="mt-0.5 text-[13px] font-semibold text-red-400">
                -{stats.totalDeletions.toLocaleString()}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* findings for this repo */}
      <RepoFindings repoId={repoId} />
    </div>
  );
}

// ── Findings sub-section ────────────────────────────────────────────────────
function RepoFindings({ repoId }: { repoId: string }) {
  const { workspaceId } = useWorkspace();
  const [findings, setFindings] = useState<any[]>([]);
  const [loading,  setLoading ] = useState(true);

  useEffect(() => {
    if (!workspaceId) return;
    fetch(`/api/sentra/findings?workspaceId=${workspaceId}&repoId=${repoId}`)
      .then(r => r.json())
      .then(d => setFindings(d.findings ?? []))
      .finally(() => setLoading(false));
  }, [workspaceId, repoId]);

  const criticals = findings.filter(f => f.severity === "CRITICAL").length;
  const warnings  = findings.filter(f => f.severity === "WARNING").length;
  // const open      = findings.filter(f => f.status === "OPEN").length;

  if (loading) return null;
  if (findings.length === 0) return null;

  return (
    <Card>
      <CardHead
        title="Security findings"
        action={
          <div className="flex items-center gap-2">
            {criticals > 0 && <SBadge sev="Critical"><AlertTriangle className="h-3 w-3" />{criticals} critical</SBadge>}
            {warnings  > 0 && <SBadge sev="Warning">{warnings} warning</SBadge>}
          </div>
        }
      />
      <div className="divide-y divide-white/5">
        {findings.slice(0, 5).map(f => (
          <div key={f.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex items-center gap-3 min-w-0">
              <SBadge sev={
                f.severity === "CRITICAL" ? "Critical" :
                f.severity === "WARNING"  ? "Warning"  : "Info"
              }>
                {f.severity}
              </SBadge>
              <div className="min-w-0">
                <p className="truncate text-[12.5px] text-white/70">{f.title}</p>
                <p className="font-mono text-[11px] text-white/25">
                  {f.filePath}{f.lineNumber ? `:${f.lineNumber}` : ""}
                </p>
              </div>
            </div>
            <SBadge sev={
              f.status === "OPEN"      ? "Critical" :
              f.status === "IN_REVIEW" ? "Warning"  :
              f.status === "FIXED"     ? "Success"  : "Neutral"
            }>
              {f.status.replace("_", " ")}
            </SBadge>
          </div>
        ))}
        {findings.length > 5 && (
          <p className="pt-3 text-[11.5px] text-white/25 text-center">
            +{findings.length - 5} more findings — view in Vulnerabilities tab
          </p>
        )}
      </div>
    </Card>
  );
}