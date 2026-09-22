/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import {
  Download,
  ChevronRight,
  Check,
  GitPullRequest,
  X,
  Loader2,
  RefreshCw,
  Filter,
  AlertTriangle,
  ShieldAlert,
  Info,
} from "lucide-react";
import { SBadge, DiffBlock, Card } from "../sentra-ui";
import { useWorkspace } from "@/lib/workspace-context";

type Sev = "CRITICAL" | "WARNING" | "INFO";
type Status = "OPEN" | "IN_REVIEW" | "FIXED" | "IGNORED";

interface Finding {
  id: string;
  severity: Sev;
  title: string;
  description: string;
  filePath: string;
  lineNumber: number | null;
  cwe: string | null;
  rule: string | null;
  snippet: string | null;
  diffBefore: string | null;
  diffAfter: string | null;
  fix: string | null;
  status: Status;
  autoFixed: boolean;
  createdAt: string;
  repo: {
    fullName: string;
    owner: string;
    repoName: string;
  };
}

const SEV_UI: Record<
  Sev,
  {
    badge: "Critical" | "Warning" | "Info";
    icon: React.ReactNode;
    label: string;
  }
> = {
  CRITICAL: {
    badge: "Critical",
    icon: <AlertTriangle className="h-3 w-3" />,
    label: "Critical",
  },
  WARNING: {
    badge: "Warning",
    icon: <ShieldAlert className="h-3 w-3" />,
    label: "Warning",
  },
  INFO: { badge: "Info", icon: <Info className="h-3 w-3" />, label: "Info" },
};

const STATUS_UI: Record<
  Status,
  "Critical" | "Warning" | "Success" | "Neutral"
> = {
  OPEN: "Critical",
  IN_REVIEW: "Warning",
  FIXED: "Success",
  IGNORED: "Neutral",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "just now";
}

export function VulnerabilitiesPage() {
  const { workspaceId } = useWorkspace();

  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [sevFilter, setSevFilter] = useState("");
  const [statFilter, setStatFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [attackPaths, setAttackPaths] = useState<any[]>([]);

  const fetchFindings = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ workspaceId });
      if (sevFilter) params.set("severity", sevFilter);
      if (statFilter) params.set("status", statFilter);

      const res = await fetch(`/api/sentra/findings?${params}`);
      const data = await res.json();
      setFindings(data.findings ?? []);

      const apRes = await fetch(
        `/api/sentra/attack-paths?workspaceId=${workspaceId}`,
      );
      const apData = await apRes.json();
      setAttackPaths(apData.attackPaths ?? []);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, sevFilter, statFilter]);

  useEffect(() => {
    fetchFindings();
  }, [fetchFindings]);

  const updateFinding = async (
    findingId: string,
    status: Status,
    reason?: string,
  ) => {
    setUpdating(findingId);
    try {
      const res = await fetch("/api/sentra/findings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ findingId, status, ignoreReason: reason }),
      });
      const data = await res.json();
      setFindings((prev) =>
        prev.map((f) => (f.id === findingId ? { ...f, ...data.finding } : f)),
      );
      if (expanded === findingId) setExpanded(null);
    } finally {
      setUpdating(null);
    }
  };

  const bulkUpdate = async (status: Status) => {
    for (const id of selected) {
      await updateFinding(id, status);
    }
    setSelected(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const exportCSV = () => {
    const rows = [
      ["Severity", "Title", "File", "Line", "Repository", "Status", "Age"],
      ...findings.map((f) => [
        f.severity,
        f.title,
        f.filePath,
        f.lineNumber ?? "",
        f.repo.fullName,
        f.status,
        timeAgo(f.createdAt),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sentracode-findings.csv";
    a.click();
  };

  // summary counts
  const criticals = findings.filter((f) => f.severity === "CRITICAL").length;
  const warnings = findings.filter((f) => f.severity === "WARNING").length;
  const infos = findings.filter((f) => f.severity === "INFO").length;
  const open = findings.filter((f) => f.status === "OPEN").length;

  return (
    <div className="p-6 space-y-5">
      {/* header */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-white">Vulnerabilities</h1>
          <p className="mt-0.5 text-[12px] text-white/30">
            {open} open · {criticals} critical · {warnings} warnings · {infos}{" "}
            info
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            value={sevFilter}
            onChange={(e) => setSevFilter(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/50 focus:outline-none"
          >
            <option value="">All severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="WARNING">Warning</option>
            <option value="INFO">Info</option>
          </select>
          <select
            value={statFilter}
            onChange={(e) => setStatFilter(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/50 focus:outline-none"
          >
            <option value="">All statuses</option>
            <option value="OPEN">Open</option>
            <option value="IN_REVIEW">In review</option>
            <option value="FIXED">Fixed</option>
            <option value="IGNORED">Ignored</option>
          </select>
          <button
            onClick={fetchFindings}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/40 hover:bg-white/8 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/40 hover:bg-white/8 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* summary chips */}
      <div className="flex gap-2 flex-wrap">
        {[
          {
            label: `${criticals} Critical`,
            sev: "Critical" as const,
            filter: "CRITICAL",
          },
          {
            label: `${warnings} Warning`,
            sev: "Warning" as const,
            filter: "WARNING",
          },
          { label: `${infos} Info`, sev: "Info" as const, filter: "INFO" },
        ].map((c) => (
          <button
            key={c.filter}
            onClick={() => setSevFilter(sevFilter === c.filter ? "" : c.filter)}
            className={`transition-all ${sevFilter === c.filter ? "opacity-100" : "opacity-60 hover:opacity-80"}`}
          >
            <SBadge sev={c.sev}>{c.label}</SBadge>
          </button>
        ))}
      </div>

      {/* bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/8 px-4 py-2.5">
          <span className="text-[12.5px] text-primary font-medium">
            {selected.size} selected
          </span>
          <button
            onClick={() => bulkUpdate("FIXED")}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-[11.5px] text-emerald-400 hover:bg-emerald-500/25 transition-colors"
          >
            <Check className="h-3 w-3" />
            Mark all fixed
          </button>
          <button
            onClick={() => bulkUpdate("IGNORED")}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-[11.5px] text-white/40 hover:bg-white/5 transition-colors"
          >
            <X className="h-3 w-3" />
            Ignore all
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-[11px] text-white/20 hover:text-white/50"
          >
            Clear
          </button>
        </div>
      )}

      {/* table */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-white/20" />
            <p className="text-xs text-white/25">Loading findings…</p>
          </div>
        </div>
      ) : findings.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/5 bg-white/[0.02] mb-4">
              <Check className="h-6 w-6 text-emerald-400" />
            </div>
            <p className="text-sm font-medium text-white/50">
              No vulnerabilities found
            </p>
            <p className="mt-1 text-[11.5px] text-white/20">
              {sevFilter || statFilter
                ? "No findings match the current filters."
                : "Connect and scan a repository to detect security issues."}
            </p>
          </div>
        </Card>
      ) : (
        <>
          <Card className="p-0 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={
                        selected.size === findings.length &&
                        findings.length > 0
                      }
                      onChange={(e) => {
                        if (e.target.checked)
                          setSelected(new Set(findings.map((f) => f.id)));
                        else setSelected(new Set());
                      }}
                      className="accent-primary"
                    />
                  </th>
                  {[
                    "Severity",
                    "Finding",
                    "Repository",
                    "Status",
                    "Age",
                    "",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-3 text-left text-[10.5px] font-medium uppercase tracking-wider text-white/20"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {findings.map((f) => (
                  <Fragment key={f.id}>
                    <tr
                      onClick={() =>
                        setExpanded(expanded === f.id ? null : f.id)
                      }
                      className="cursor-pointer border-b border-white/5 transition-colors hover:bg-white/[0.02] last:border-0"
                    >
                      <td
                        className="px-4 py-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(f.id)}
                          onChange={() => toggleSelect(f.id)}
                          className="accent-primary"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <SBadge sev={SEV_UI[f.severity].badge}>
                          {SEV_UI[f.severity].icon}
                          {SEV_UI[f.severity].label}
                        </SBadge>
                      </td>
                      <td className="px-3 py-3 max-w-xs">
                        <p className="text-[12.5px] text-white/70 truncate">
                          {f.title}
                        </p>
                        <p className="font-mono text-[11px] text-white/25 truncate">
                          {f.filePath}
                          {f.lineNumber ? `:${f.lineNumber}` : ""}
                          {f.cwe && (
                            <span className="ml-2 text-white/15">
                              {f.cwe}
                            </span>
                          )}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-[12px] text-white/40">
                        {f.repo.fullName}
                      </td>
                      <td className="px-3 py-3">
                        <SBadge sev={STATUS_UI[f.status]}>
                          {f.status.replace("_", " ")}
                        </SBadge>
                      </td>
                      <td className="px-3 py-3 text-[11.5px] text-white/25">
                        {timeAgo(f.createdAt)}
                      </td>
                      <td className="px-3 py-3">
                        <ChevronRight
                          className={`h-4 w-4 text-white/15 transition-transform ${expanded === f.id ? "rotate-90" : ""}`}
                        />
                      </td>
                    </tr>

                    {/* expanded detail */}
                    {expanded === f.id && (
                      <tr className="border-b border-white/5">
                        <td colSpan={7} className="px-4 pb-5 pt-2">
                          <div className="rounded-xl border border-white/5 bg-white/[0.015] p-5 space-y-4">
                            {/* description */}
                            <div>
                              <p className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wider text-white/20">
                                Description
                              </p>
                              <p className="text-[12.5px] text-white/60 leading-relaxed">
                                {f.description}
                              </p>
                            </div>

                            {/* AI diff */}
                            {(f.diffBefore || f.diffAfter) && (
                              <div>
                                <p className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wider text-white/20">
                                  AI Remediation — suggested patch
                                </p>
                                <DiffBlock
                                  file={`${f.filePath}${f.lineNumber ? `:${f.lineNumber}` : ""}${f.cwe ? ` · ${f.cwe}` : ""}`}
                                  lines={[
                                    ...(f.diffBefore
                                      ? f.diffBefore.split("\n").map((t) => ({
                                          type: "-" as const,
                                          text: t,
                                        }))
                                      : []),
                                    ...(f.diffAfter
                                      ? f.diffAfter.split("\n").map((t) => ({
                                          type: "+" as const,
                                          text: t,
                                        }))
                                      : []),
                                  ]}
                                />
                              </div>
                            )}

                            {/* fix explanation */}
                            {f.fix && (
                              <div>
                                <p className="mb-1 text-[10.5px] font-medium uppercase tracking-wider text-white/20">
                                  How to fix
                                </p>
                                <p className="text-[12.5px] text-white/50 leading-relaxed">
                                  {f.fix}
                                </p>
                              </div>
                            )}

                            {/* snippet */}
                            {f.snippet && !f.diffBefore && (
                              <div>
                                <p className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wider text-white/20">
                                  Vulnerable snippet
                                </p>
                                <div className="overflow-x-auto rounded-lg border border-white/8 bg-black/30 p-3 font-mono text-[11.5px] text-red-400">
                                  {f.snippet}
                                </div>
                              </div>
                            )}

                            {/* actions */}
                            {f.status === "OPEN" || f.status === "IN_REVIEW" ? (
                              <div className="flex gap-2 flex-wrap pt-1">
                                <button
                                  onClick={() => updateFinding(f.id, "FIXED")}
                                  disabled={updating === f.id}
                                  className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-[11.5px] font-medium text-white hover:bg-primary/90 disabled:opacity-40 transition-colors"
                                >
                                  {updating === f.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <GitPullRequest className="h-3.5 w-3.5" />
                                  )}
                                  Create PR from fix
                                </button>
                                <button
                                  onClick={() => updateFinding(f.id, "FIXED")}
                                  disabled={updating === f.id}
                                  className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[11.5px] text-white/50 hover:bg-white/8 transition-colors"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  Mark fixed
                                </button>
                                <button
                                  onClick={() =>
                                    updateFinding(f.id, "IN_REVIEW")
                                  }
                                  disabled={updating === f.id}
                                  className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[11.5px] text-white/40 hover:bg-white/8 transition-colors"
                                >
                                  In review
                                </button>
                                <button
                                  onClick={() =>
                                    updateFinding(f.id, "IGNORED")
                                  }
                                  disabled={updating === f.id}
                                  className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[11.5px] text-white/30 hover:bg-white/8 transition-colors"
                                >
                                  <X className="h-3.5 w-3.5" />
                                  Ignore
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <SBadge sev={STATUS_UI[f.status]}>
                                  {f.status}
                                </SBadge>
                                <button
                                  onClick={() => updateFinding(f.id, "OPEN")}
                                  className="text-[11px] text-white/20 hover:text-white/50"
                                >
                                  Reopen
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </Card>

          {attackPaths.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-[12px] font-medium uppercase tracking-wider text-white/25">
                AI Attack Paths — {attackPaths.length} chain
                {attackPaths.length !== 1 ? "s" : ""} identified
              </h2>
              {attackPaths.map((ap, i) => (
                <Card
                  key={i}
                  className={`border ${
                    ap.severity === "CRITICAL"
                      ? "border-red-500/20 bg-red-500/[0.03]"
                      : ap.severity === "HIGH"
                        ? "border-orange-500/20 bg-orange-500/[0.03]"
                        : "border-amber-500/20 bg-amber-500/[0.03]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <SBadge
                          sev={
                            ap.severity === "CRITICAL"
                              ? "Critical"
                              : ap.severity === "HIGH"
                                ? "Critical"
                                : "Warning"
                          }
                        >
                          Attack Path
                        </SBadge>
                        <h3 className="text-[13px] font-medium text-white">
                          {ap.title}
                        </h3>
                      </div>
                      <p className="mt-1 text-[12px] text-white/40">
                        {ap.description}
                      </p>
                    </div>
                    {ap.cvssScore && (
                      <span
                        className={`shrink-0 text-lg font-bold ${
                          ap.cvssScore >= 9
                            ? "text-red-400"
                            : ap.cvssScore >= 7
                              ? "text-orange-400"
                              : "text-amber-400"
                        }`}
                      >
                        {ap.cvssScore}
                      </span>
                    )}
                  </div>

                  {/* attack steps */}
                  <div className="space-y-2 mb-3">
                    {(ap.steps ?? []).map((step: any, j: number) => (
                      <div key={j} className="flex gap-3">
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/8 text-[9px] font-bold text-white/40">
                          {step.stepNumber}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[12px] font-medium text-white/60">
                            {step.action}
                          </p>
                          <p className="text-[11px] text-white/30">
                            {step.description}
                          </p>
                          {step.file && (
                            <p className="font-mono text-[10px] text-white/20 mt-0.5">
                              {step.file}
                              {step.line ? `:${step.line}` : ""}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* impact + fix */}
                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/5">
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-white/20 mb-1">
                        Business impact
                      </p>
                      <p className="text-[12px] text-white/50">
                        {ap.businessImpact}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-white/20 mb-1">
                        Break the chain
                      </p>
                      <p className="text-[12px] text-white/50">
                        {ap.remediation}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}