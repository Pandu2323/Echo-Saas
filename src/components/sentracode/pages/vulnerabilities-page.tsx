/* eslint-disable @typescript-eslint/no-unused-expressions */
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
  AlertTriangle,
  ShieldAlert,
  Info,
  Wand2,
  CheckCircle2,
  XCircle,
  ExternalLink,
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
  const [fixes, setFixes] = useState<Record<string, any>>({});
  const [fixing, setFixing] = useState<Record<string, boolean>>({});

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

  const pollFix = async (findingId: string) => {
    const interval = setInterval(async () => {
      const res = await fetch(`/api/sentra/fix?findingId=${findingId}`);
      const data = await res.json();
      const fix = data.fix;
      if (fix) {
        setFixes((prev) => ({ ...prev, [findingId]: fix }));
        if (["VERIFIED", "PR_CREATED", "FAILED"].includes(fix.status)) {
          clearInterval(interval);
          setFixing((prev) => ({ ...prev, [findingId]: false }));
          // refresh findings
          fetchFindings();
        }
      }
    }, 3000);
  };

  const handleFix = async (findingId: string, withPR: boolean) => {
    if (!workspaceId) return;
    setFixing((prev) => ({ ...prev, [findingId]: true }));
    setFixes((prev) => ({ ...prev, [findingId]: { status: "PENDING" } }));

    const res = await fetch("/api/sentra/fix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ findingId, workspaceId, createPR: withPR }),
    });

    if (res.ok) {
      pollFix(findingId);
    } else {
      setFixing((prev) => ({ ...prev, [findingId]: false }));
    }
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

                            {/* Fix + Verify panel */}
                            <div className="pt-3 border-t border-white/5">
                              {!fixes[f.id] ? (
                                // initial action buttons
                                <div className="flex gap-2 flex-wrap">
                                  <button
                                    onClick={() => handleFix(f.id, false)}
                                    disabled={fixing[f.id]}
                                    className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-[11.5px] font-medium text-white hover:bg-primary/90 disabled:opacity-40 transition-colors"
                                  >
                                    {fixing[f.id] ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Wand2 className="h-3.5 w-3.5" />
                                    )}
                                    Generate AI fix
                                  </button>
                                  <button
                                    onClick={() => handleFix(f.id, true)}
                                    disabled={fixing[f.id]}
                                    className="flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/8 px-3 py-2 text-[11.5px] text-primary hover:bg-primary/15 disabled:opacity-40 transition-colors"
                                  >
                                    {fixing[f.id] ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <GitPullRequest className="h-3.5 w-3.5" />
                                    )}
                                    Fix + Create PR
                                  </button>
                                  <button
                                    onClick={() =>
                                      updateFinding(f.id, "IN_REVIEW")
                                    }
                                    className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11.5px] text-white/40 hover:bg-white/8 transition-colors"
                                  >
                                    Mark in review
                                  </button>
                                  <button
                                    onClick={() =>
                                      updateFinding(f.id, "IGNORED")
                                    }
                                    className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11.5px] text-white/30 hover:bg-white/8 transition-colors"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                    Ignore
                                  </button>
                                </div>
                              ) : (
                                // fix progress / result
                                <FixStatusPanel
                                  fix={fixes[f.id]}
                                  isFixing={fixing[f.id]}
                                />
                              )}
                            </div>
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

function FixStatusPanel({
  fix,
  isFixing,
}: {
  fix: any;
  isFixing: boolean;
}) {
  const STATUS_CONFIG: Record<
    string,
    { icon: React.ReactNode; label: string; color: string }
  > = {
    PENDING: {
      icon: <Loader2 className="h-4 w-4 animate-spin text-primary" />,
      label: "Generating fix…",
      color: "border-primary/20 bg-primary/5",
    },
    GENERATED: {
      icon: <Loader2 className="h-4 w-4 animate-spin text-amber-400" />,
      label: "Verifying fix…",
      color: "border-amber-500/20 bg-amber-500/5",
    },
    VERIFIED: {
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
      label: "Fix verified",
      color: "border-emerald-500/20 bg-emerald-500/5",
    },
    PR_CREATED: {
      icon: <GitPullRequest className="h-4 w-4 text-blue-400" />,
      label: "PR created",
      color: "border-blue-500/20 bg-blue-500/5",
    },
    FAILED: {
      icon: <XCircle className="h-4 w-4 text-red-400" />,
      label: "Fix failed",
      color: "border-red-500/20 bg-red-500/5",
    },
  };

  const cfg = STATUS_CONFIG[fix?.status] ?? STATUS_CONFIG.PENDING;

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${cfg.color}`}>
      {/* status header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {cfg.icon}
          <span className="text-[12.5px] font-medium text-white/70">
            {cfg.label}
          </span>
        </div>
        {fix?.verificationStatus && (
          <span
            className={`text-[11px] font-medium px-2 py-0.5 rounded-lg ${
              fix.verificationStatus === "RESOLVED"
                ? "bg-emerald-500/15 text-emerald-400"
                : fix.verificationStatus === "REGRESSION"
                  ? "bg-red-500/15 text-red-400"
                  : fix.verificationStatus === "PARTIAL"
                    ? "bg-amber-500/15 text-amber-400"
                    : "bg-white/10 text-white/30"
            }`}
          >
            Verify: {fix.verificationStatus}
          </span>
        )}
      </div>

      {/* patch diff */}
      {fix?.patchDiff && (
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-white/20">
            AI-generated patch
          </p>
          <div className="overflow-x-auto rounded-lg border border-white/8 bg-black/30 p-3 font-mono text-[11px] leading-relaxed">
            {fix.patchDiff.split("\n").map((line: string, i: number) => (
              <div
                key={i}
                className={
                  line.startsWith("+")
                    ? "text-emerald-400"
                    : line.startsWith("-")
                      ? "text-red-400"
                      : "text-white/30"
                }
              >
                {line}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* verification notes */}
      {fix?.verificationNotes && (
        <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-white/20 mb-1">
            Verification
          </p>
          <p className="text-[12px] text-white/50">{fix.verificationNotes}</p>
        </div>
      )}

      {/* regression warning */}
      {fix?.verificationStatus === "REGRESSION" && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/8 p-3">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400 mt-0.5" />
          <p className="text-[12px] text-amber-400/80">
            New issues introduced by the fix. Review the patch carefully
            before merging.
          </p>
        </div>
      )}

      {/* PR link */}
      {fix?.prUrl && (
        <a
          href={fix.prUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-xl border border-blue-500/25 bg-blue-500/8 px-3 py-2.5 text-[12.5px] font-medium text-blue-400 hover:bg-blue-500/15 transition-colors"
        >
          <GitPullRequest className="h-3.5 w-3.5" />
          View PR #{fix.prNumber} on GitHub
          <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
        </a>
      )}
    </div>
  );
}