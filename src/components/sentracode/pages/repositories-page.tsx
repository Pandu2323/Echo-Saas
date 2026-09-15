/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Plus, ChevronRight, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { SBadge, StatCard, Card } from "../sentra-ui";
import { GitBranch, GitPullRequest, AlertCircle, GitMerge } from "lucide-react";
import { useWorkspace } from "@/lib/workspace-context";

interface Repo {
  id:          string;
  fullName:    string;
  description: string | null;
  isPrivate:   boolean;
  language:    string | null;
  languages:   Record<string, number> | null;
  scanStatus:  string;
  riskScore:   string | null;
  lastScanAt:  string | null;
  totalCommits:number;
  _count:      { findings: number; commits: number };
  findings:    { severity: string }[];
}

const LANG_COLORS: Record<string, string> = {
  TypeScript: "#378ADD", JavaScript: "#F7DF1E", Python: "#BA7517",
  Go: "#00ADD8", Rust: "#D85A30", Java: "#ED8B00",
  "C#": "#239120", PHP: "#777BB4", Ruby: "#CC342D",
};

export function RepositoriesPage({ onNavigate }: { onNavigate: (p: any, extra?: any) => void }) {
  const { workspaceId }     = useWorkspace();
  const [repos,    setRepos   ] = useState<Repo[]>([]);
  const [q,        setQ       ] = useState("");
  const [loading,  setLoading ] = useState(true);
  const [showAdd,  setShowAdd ] = useState(false);
  const [repoUrl,  setRepoUrl ] = useState("");
  const [adding,   setAdding  ] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [scanning, setScanning] = useState<Record<string, boolean>>({});

  const fetchRepos = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/sentra/repos?workspaceId=${workspaceId}`);
      const data = await res.json();
      setRepos(data.repos ?? []);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { fetchRepos(); }, [fetchRepos]);

  const handleAdd = async () => {
    if (!repoUrl.trim() || !workspaceId) return;
    setAdding(true);
    setAddError(null);
    try {
      const res  = await fetch("/api/sentra/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, githubUrl: repoUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setAddError(data.error ?? "Failed to add repo"); return; }
      setRepoUrl("");
      setShowAdd(false);
      await fetchRepos();
    } finally {
      setAdding(false);
    }
  };

  const handleScan = async (repo: Repo) => {
    if (!workspaceId) return;
    setScanning(prev => ({ ...prev, [repo.id]: true }));
    try {
      await fetch("/api/sentra/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoId: repo.id, workspaceId }),
      });
      // poll for completion
      const poll = setInterval(async () => {
        const res  = await fetch(`/api/sentra/repos?workspaceId=${workspaceId}`);
        const data = await res.json();
        const updated = data.repos?.find((r: Repo) => r.id === repo.id);
        if (updated?.scanStatus !== "SCANNING") {
          clearInterval(poll);
          setScanning(prev => ({ ...prev, [repo.id]: false }));
          setRepos(data.repos ?? []);
        }
      }, 3000);
    } catch {
      setScanning(prev => ({ ...prev, [repo.id]: false }));
    }
  };

  const handleDisconnect = async (repoId: string) => {
    if (!confirm("Disconnect this repository? All findings will be deleted.")) return;
    await fetch(`/api/sentra/repos/${repoId}`, { method: "DELETE" });
    setRepos(prev => prev.filter(r => r.id !== repoId));
  };

  const filtered = repos.filter(r =>
    r.fullName.toLowerCase().includes(q.toLowerCase()) ||
    (r.description ?? "").toLowerCase().includes(q.toLowerCase())
  );

  const statusBadge = (status: string) => {
    if (status === "SCANNING")  return <SBadge sev="Warning"><Loader2 className="h-2.5 w-2.5 animate-spin" />Scanning</SBadge>;
    if (status === "COMPLETED") return <SBadge sev="Success">Scanned</SBadge>;
    if (status === "FAILED")    return <SBadge sev="Critical">Failed</SBadge>;
    return <SBadge sev="Neutral">Pending</SBadge>;
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Repositories</h1>
          <p className="mt-0.5 text-[12px] text-white/30">{repos.length} repositories connected</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchRepos} className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/40 hover:bg-white/8 transition-colors">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add repository
          </button>
        </div>
      </div>

      {/* add repo panel */}
      {showAdd && (
        <Card>
          <h3 className="mb-3 text-[13px] font-medium text-white">Connect a GitHub repository</h3>
          <div className="flex gap-2">
            <input
              value={repoUrl}
              onChange={e => setRepoUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAdd()}
              placeholder="https://github.com/owner/repo"
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/20 focus:border-primary/50 focus:outline-none"
            />
            <button
              onClick={handleAdd}
              disabled={adding || !repoUrl.trim()}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-medium text-white disabled:opacity-40 hover:bg-primary/90"
            >
              {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {adding ? "Connecting…" : "Connect"}
            </button>
            <button onClick={() => { setShowAdd(false); setRepoUrl(""); setAddError(null); }}
              className="rounded-xl border border-white/10 px-3 py-2 text-xs text-white/40 hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
          {addError && <p className="mt-2 text-[11.5px] text-red-400">{addError}</p>}
          <p className="mt-2 text-[11px] text-white/20">
            For private repos, add your GitHub token in Settings first.
          </p>
        </Card>
      )}

      {/* search */}
      <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-white/20" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search repositories…"
          className="w-full bg-transparent text-xs text-white placeholder:text-white/20 focus:outline-none"
        />
      </div>

      {/* repo list */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-white/20" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <GitBranch className="h-8 w-8 text-white/10 mb-3" />
            <p className="text-sm text-white/30">No repositories connected</p>
            <p className="mt-1 text-[11.5px] text-white/15">Paste a GitHub URL above to start tracking</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => {
            const langs    = Object.keys(r.languages ?? {}).slice(0, 3);
            const criticals = r.findings.filter(f => f.severity === "CRITICAL").length;
            const warnings  = r.findings.filter(f => f.severity === "WARNING").length;
            const isScanning = scanning[r.id] || r.scanStatus === "SCANNING";

            return (
              <div
                key={r.id}
                className="flex items-center gap-4 rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-colors hover:border-white/10"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <GitBranch className="h-4 w-4" />
                </div>

                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onNavigate("repo-detail", { repoId: r.id })}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[13.5px] font-medium text-white">{r.fullName}</p>
                    <SBadge sev={r.isPrivate ? "Neutral" : "Success"}>{r.isPrivate ? "Private" : "Public"}</SBadge>
                    {statusBadge(r.scanStatus)}
                    {r.riskScore && <SBadge sev={r.riskScore.startsWith("A") ? "Success" : r.riskScore.startsWith("B") ? "Warning" : "Critical"}>Risk: {r.riskScore}</SBadge>}
                  </div>
                  <p className="mt-0.5 text-[12px] text-white/30 truncate">{r.description ?? "No description"}</p>
                  <div className="mt-1.5 flex gap-3 flex-wrap">
                    {langs.map(lang => (
                      <span key={lang} className="flex items-center gap-1 text-[11px] text-white/30">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: LANG_COLORS[lang] ?? "#888" }} />
                        {lang}
                      </span>
                    ))}
                    {criticals > 0 && <span className="text-[11px] text-red-400">{criticals} critical</span>}
                    {warnings  > 0 && <span className="text-[11px] text-amber-400">{warnings} warning</span>}
                    {r.lastScanAt && <span className="text-[11px] text-white/20">Last scan: {new Date(r.lastScanAt).toLocaleDateString()}</span>}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => handleScan(r)}
                    disabled={isScanning}
                    className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[11.5px] text-white/50 hover:bg-white/8 disabled:opacity-40 transition-colors"
                  >
                    {isScanning ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    {isScanning ? "Scanning…" : "Scan now"}
                  </button>
                  <button
                    onClick={() => handleDisconnect(r.id)}
                    className="rounded-xl border border-white/8 p-1.5 text-white/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <ChevronRight className="h-4 w-4 text-white/15 cursor-pointer" onClick={() => onNavigate("repo-detail", { repoId: r.id })} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* quick stats */}
      <div>
        <h3 className="mb-3 text-[12px] font-medium uppercase tracking-wider text-white/20">Quick stats</h3>
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Total repos"   value={repos.length} icon={<GitBranch className="h-3.5 w-3.5 text-primary" />} />
          <StatCard label="Total commits" value={repos.reduce((s, r) => s + r.totalCommits, 0)} icon={<GitMerge className="h-3.5 w-3.5 text-primary" />} />
          <StatCard label="Critical findings" valueColor="text-red-400" value={repos.reduce((s, r) => s + r.findings.filter(f => f.severity === "CRITICAL").length, 0)} icon={<AlertCircle className="h-3.5 w-3.5 text-red-400" />} />
          <StatCard label="Repos scanned" value={repos.filter(r => r.scanStatus === "COMPLETED").length} icon={<GitPullRequest className="h-3.5 w-3.5 text-emerald-400" />} />
        </div>
      </div>
    </div>
  );
}