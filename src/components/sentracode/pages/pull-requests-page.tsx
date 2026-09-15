/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useState, useEffect, useCallback } from "react";
import { GitPullRequest, RefreshCw, Loader2, Play } from "lucide-react";
import { SBadge, Card, CardHead } from "../sentra-ui";
import { useWorkspace } from "@/lib/workspace-context";

interface PR {
  repoId:   string;
  repoName: string;
  number:   number;
  title:    string;
  branch:   string;
  author:   string;
  avatar:   string;
  verdict:  "PENDING" | "PASSED" | "CRITICAL_ISSUE" | "NEEDS_REVIEW";
  summary?: string;
}

const VERDICT_UI = {
  PENDING:        { sev: "Neutral"  as const, label: "Pending review"  },
  PASSED:         { sev: "Success"  as const, label: "Passed review"   },
  CRITICAL_ISSUE: { sev: "Critical" as const, label: "Critical issue"  },
  NEEDS_REVIEW:   { sev: "Warning"  as const, label: "Needs review"    },
};

export function PullRequestsPage() {
  const { workspaceId } = useWorkspace();

  const [prs,      setPRs     ] = useState<PR[]>([]);
  const [loading,  setLoading ] = useState(true);
  const [reviewing,setReviewing] = useState<string | null>(null);
  const [expanded, setExpanded ] = useState<string | null>(null);

  const fetchPRs = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/sentra/pr-review?workspaceId=${workspaceId}`);
      const data = await res.json();
      setPRs(data.prs ?? []);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { fetchPRs(); }, [fetchPRs]);

  const runReview = async (pr: PR) => {
    const key = `${pr.repoId}-${pr.number}`;
    setReviewing(key);
    try {
      const res  = await fetch("/api/sentra/pr-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          repoId:   pr.repoId,
          prNumber: pr.number,
        }),
      });
      const data = await res.json();
      const review = data.review;

      setPRs(prev =>
        prev.map(p =>
          p.repoId === pr.repoId && p.number === pr.number
            ? { ...p, verdict: review.verdict, summary: review.summary }
            : p
        )
      );
      setExpanded(key);
    } finally {
      setReviewing(null);
    }
  };

  const passed   = prs.filter(p => p.verdict === "PASSED").length;
  const critical = prs.filter(p => p.verdict === "CRITICAL_ISSUE").length;
  const needs    = prs.filter(p => p.verdict === "NEEDS_REVIEW").length;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Pull requests</h1>
          <p className="mt-0.5 text-[12px] text-white/30">AI security review across open pull requests</p>
        </div>
        <button
          onClick={fetchPRs}
          className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/40 hover:bg-white/8 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-white/20" />
        </div>
      ) : prs.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <GitPullRequest className="h-8 w-8 text-white/10 mb-3" />
            <p className="text-sm text-white/30">No open pull requests</p>
            <p className="mt-1 text-[11.5px] text-white/15">
              Connect repositories to monitor pull requests
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {prs.map(pr => {
            const key = `${pr.repoId}-${pr.number}`;
            const isReviewing = reviewing === key;
            const isExpanded  = expanded  === key;
            const ui          = VERDICT_UI[pr.verdict];

            return (
              <div key={key} className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
                <div className="flex items-center gap-4 p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <GitPullRequest className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13.5px] font-medium text-white">{pr.title}</p>
                      <SBadge sev="Neutral">#{pr.number}</SBadge>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                      <p className="text-[12px] text-white/30">{pr.repoName}</p>
                      <span className="text-white/15">·</span>
                      <p className="text-[12px] text-white/20">
                        {pr.branch} · by {pr.author}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <SBadge sev={ui.sev}>{ui.label}</SBadge>
                    <button
                      onClick={() => runReview(pr)}
                      disabled={isReviewing}
                      className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[11.5px] text-white/50 hover:bg-white/8 disabled:opacity-40 transition-colors"
                    >
                      {isReviewing
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Play className="h-3 w-3" />}
                      {isReviewing ? "Reviewing…" : "Run AI review"}
                    </button>
                  </div>
                </div>

                {/* review result */}
                {isExpanded && pr.summary && (
                  <div className="border-t border-white/5 bg-white/[0.015] px-5 py-4">
                    <p className="text-[10.5px] font-medium uppercase tracking-wider text-white/20 mb-2">
                      AI Security Review
                    </p>
                    <p className="text-[12.5px] text-white/60 leading-relaxed">{pr.summary}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* summary */}
      {prs.length > 0 && (
        <Card>
          <CardHead title="Review summary" />
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Passed",         count: passed,   sev: "Success"  as const },
              { label: "Needs review",   count: needs,    sev: "Warning"  as const },
              { label: "Critical issue", count: critical, sev: "Critical" as const },
            ].map(s => (
              <div key={s.label} className="rounded-xl border border-white/5 bg-white/[0.015] p-4 text-center">
                <p className="text-2xl font-semibold text-white">{s.count}</p>
                <p className="mt-1">
                  <SBadge sev={s.sev}>{s.label}</SBadge>
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}