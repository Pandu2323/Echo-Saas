"use client";

import { GitPullRequest } from "lucide-react";
import { SBadge, Card } from "../sentra-ui";

const PRS = [
  { title: "Add rate limiting middleware",  repo: "sneakybuzz/sentenara", num: 482, verdict: "Critical issue found", vs: "Critical" as const, ci: "Passing", cs: "Success" as const },
  { title: "Refactor auth token handling",  repo: "sneakybuzz/patron",    num: 479, verdict: "Passed review",        vs: "Success" as const, ci: "Passing", cs: "Success" as const },
  { title: "Bump lodash to 4.17.21",        repo: "sneakybuzz/echo",      num: 474, verdict: "Needs review",         vs: "Warning" as const, ci: "Running", cs: "Warning" as const },
];

export function PullRequestsPage() {
  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-white">Pull requests</h1>
        <p className="mt-0.5 text-[12px] text-white/30">AI review status across open pull requests</p>
      </div>

      <div className="space-y-2.5">
        {PRS.map((p, i) => (
          <div key={i} className="flex items-center gap-4 rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <GitPullRequest className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-[13.5px] font-medium text-white">{p.title}</p>
                <SBadge sev="Neutral">#{p.num}</SBadge>
              </div>
              <p className="mt-0.5 text-[12px] text-white/30">{p.repo}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <SBadge sev={p.cs}>CI {p.ci}</SBadge>
              <SBadge sev={p.vs}>{p.verdict}</SBadge>
            </div>
          </div>
        ))}
      </div>

      <Card>
        <h3 className="mb-3 text-[13px] font-medium text-white">AI review summary</h3>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Passed",        count: 1, color: "text-emerald-400" },
            { label: "Needs review",  count: 1, color: "text-amber-400"   },
            { label: "Critical issue",count: 1, color: "text-red-400"     },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-white/5 bg-white/[0.015] p-4 text-center">
              <p className={`text-2xl font-semibold ${s.color}`}>{s.count}</p>
              <p className="mt-1 text-[11.5px] text-white/30">{s.label}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}