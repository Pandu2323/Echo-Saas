/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { Search, Plus, ChevronRight } from "lucide-react";
import { SBadge, StatCard, Card } from "../sentra-ui";
import { GitBranch, GitPullRequest, AlertCircle, GitMerge } from "lucide-react";

const REPOS = [
  { name: "sneakybuzz/patron",     vis: "Public",  desc: "Personal portfolio and web application",             langs: [["TypeScript","#378ADD"],["Next.js","#888780"]], commits: 128, files: 12, bar: [["#378ADD",35],["#4FD1C5",35],["#8B5CF6",30]] },
  { name: "sneakybuzz/echo",       vis: "Private", desc: "AI video and knowledge platform",                   langs: [["TypeScript","#378ADD"],["Next.js","#888780"]], commits: 64,  files: 8,  bar: [["#378ADD",30],["#8B5CF6",40],["#4FD1C5",30]] },
  { name: "sneakybuzz/loomx",      vis: "Public",  desc: "Decentralised lending and credit scoring platform", langs: [["Python","#BA7517"],["Flask","#888780"]],        commits: 52,  files: 6,  bar: [["#4FD1C5",40],["#8B5CF6",30],["#4ADE80",30]] },
  { name: "sneakybuzz/sentenara",  vis: "Public",  desc: "Legal AI assistant with RAG",                      langs: [["Python","#BA7517"],["FastAPI","#639922"]],      commits: 37,  files: 4,  bar: [["#378ADD",45],["#4FD1C5",30],["#378ADD",25]] },
  { name: "sneakybuzz/product-price-predictor", vis: "Public", desc: "ML model for product price prediction", langs: [["Python","#BA7517"],["Jupyter","#D85A30"]],   commits: 28,  files: 3,  bar: [["#4FD1C5",35],["#8B5CF6",35],["#BA7517",30]] },
  { name: "sneakybuzz/networksecurity", vis: "Private", desc: "Network security analysis using ML",          langs: [["Python","#BA7517"],["MLflow","#378ADD"]],      commits: 21,  files: 2,  bar: [["#4FD1C5",50],["#8B5CF6",50]] },
];

export function RepositoriesPage({ onNavigate }: { onNavigate: (p: any) => void }) {
  const [q,       setQ      ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");

  const filtered = REPOS.filter(r =>
    r.name.toLowerCase().includes(q.toLowerCase()) ||
    r.desc.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Repositories</h1>
          <p className="mt-0.5 text-[12px] text-white/30">6 repositories · connected via GitHub</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add repository
        </button>
      </div>

      {/* add repo panel */}
      {showAdd && (
        <Card>
          <h3 className="mb-3 text-[13px] font-medium text-white">Add repository</h3>
          <div className="flex gap-2">
            <input
              value={repoUrl}
              onChange={e => setRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/20 focus:border-primary/50 focus:outline-none"
            />
            <button className="rounded-xl bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary/90">Track repository</button>
            <button onClick={() => setShowAdd(false)} className="rounded-xl border border-white/10 px-3 py-2 text-xs text-white/40 hover:bg-white/5">Cancel</button>
          </div>
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
      <div className="space-y-2">
        {filtered.map(r => (
          <div
            key={r.name}
            onClick={() => onNavigate("repo-detail")}
            className="flex items-center gap-4 rounded-xl border border-white/5 bg-white/[0.02] p-4 cursor-pointer transition-colors hover:border-white/12 hover:bg-white/[0.035]"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <GitBranch className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-[13.5px] font-medium text-white">{r.name}</p>
                <SBadge sev={r.vis === "Public" ? "Success" : "Neutral"}>{r.vis}</SBadge>
              </div>
              <p className="mt-0.5 text-[12px] text-white/35">{r.desc}</p>
              <div className="mt-1.5 flex gap-3">
                {r.langs.map(([lang, color]) => (
                  <span key={lang} className="flex items-center gap-1 text-[11px] text-white/30">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color as string }} />
                    {lang}
                  </span>
                ))}
              </div>
            </div>

            {/* commit bar */}
            <div className="flex h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-white/5">
              {(r.bar as [string, number][]).map(([c, w], i) => (
                <div key={i} style={{ width: `${w}%`, backgroundColor: c }} />
              ))}
            </div>

            <div className="flex shrink-0 gap-4 text-right">
              <div><p className="text-[14px] font-semibold text-white">{r.commits}</p><p className="text-[10px] text-white/25">commits</p></div>
              <div><p className="text-[14px] font-semibold text-white">{r.files}</p><p className="text-[10px] text-white/25">files</p></div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-white/15" />
          </div>
        ))}
      </div>

      {/* quick stats */}
      <div>
        <h3 className="mb-3 text-[12px] font-medium uppercase tracking-wider text-white/20">Quick stats · last 7 days</h3>
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Total commits" value={330} trend="18%" trendDir="up" icon={<GitMerge className="h-3.5 w-3.5 text-primary" />} />
          <StatCard label="Total repos"   value={6}   trend="1 new" trendDir="up" icon={<GitBranch className="h-3.5 w-3.5 text-primary" />} />
          <StatCard label="Open PRs"      value={3}   trend="2 merged" trendDir="down" icon={<GitPullRequest className="h-3.5 w-3.5 text-primary" />} />
          <StatCard label="Open issues"   value={12}  trend="4 closed" trendDir="down" icon={<AlertCircle className="h-3.5 w-3.5 text-primary" />} />
        </div>
      </div>
    </div>
  );
}