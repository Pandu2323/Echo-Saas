/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { Card, CardHead, SBadge } from "../sentra-ui";
import { Download, FileText, RefreshCw, Loader2, AlertTriangle } from "lucide-react";

interface RadarScores {
  injection:        number;
  brokenAuth:       number;
  cryptography:     number;
  misconfiguration: number;
  exposedData:      number;
  vulnerableDeps:   number;
}

type CategoryKey = keyof RadarScores;

interface Finding {
  id:       string;
  severity: string;
  title:    string;
  filePath: string;
  cwe:      string | null;
  rule:     string | null;
  status:   string;
  category: string | null;
  repo:     { fullName: string };
}

/* ── Single source of truth for categories ───────────────────────────── */
const CATEGORIES: {
  key:     CategoryKey;
  label:   string;
  sub:     string;   // short OWASP id used on the chart
  owasp:   string;   // long OWASP id used in the table
  desc:    string;
  cweList: string[];
}[] = [
  {
    key: "injection", label: "Injection", sub: "OWASP A03", owasp: "A03:2021",
    desc: "SQL, NoSQL, Command, XXE",
    cweList: ["CWE-89", "CWE-78", "CWE-943", "CWE-611"],
  },
  {
    key: "brokenAuth", label: "Broken Auth", sub: "OWASP A07", owasp: "A07:2021",
    desc: "Missing auth, hardcoded creds, CSRF",
    cweList: ["CWE-306", "CWE-287", "CWE-798", "CWE-613", "CWE-522", "CWE-352"],
  },
  {
    key: "cryptography", label: "Cryptography", sub: "OWASP A02", owasp: "A02:2021",
    desc: "Weak hash, JWT none, insecure cipher",
    cweList: ["CWE-327", "CWE-326", "CWE-347", "CWE-916"],
  },
  {
    key: "misconfiguration", label: "Misconfiguration", sub: "OWASP A05", owasp: "A05:2021",
    desc: "CORS wildcard, debug mode, open redirect",
    cweList: ["CWE-942", "CWE-770", "CWE-16", "CWE-601", "CWE-20"],
  },
  {
    key: "exposedData", label: "Exposed Data", sub: "OWASP A02", owasp: "A02:2021",
    desc: "SSRF, path traversal, data exposure",
    cweList: ["CWE-200", "CWE-598", "CWE-918", "CWE-22"],
  },
  {
    key: "vulnerableDeps", label: "Vulnerable Deps", sub: "OWASP A06", owasp: "A06:2021",
    desc: "SCA — CVE-matched dependencies",
    cweList: [],
  },
];

function countForCategory(findings: Finding[], key: CategoryKey): number {
  if (key === "vulnerableDeps") {
    return findings.filter(f => f.category === "SCA").length;
  }
  const cat = CATEGORIES.find(c => c.key === key);
  if (!cat) return 0;
  const set = new Set(cat.cweList);
  return findings.filter(f => set.has(f.cwe ?? "")).length;
}

function computeRadarScores(findings: Finding[]): RadarScores {
  const total = Math.max(findings.length, 1);
  const score = (count: number) =>
    Math.max(0, Math.round(100 - (count / total) * 100));

  return {
    injection:        score(countForCategory(findings, "injection")),
    brokenAuth:       score(countForCategory(findings, "brokenAuth")),
    cryptography:     score(countForCategory(findings, "cryptography")),
    misconfiguration: score(countForCategory(findings, "misconfiguration")),
    exposedData:      score(countForCategory(findings, "exposedData")),
    vulnerableDeps:   score(countForCategory(findings, "vulnerableDeps")),
  };
}

function gradeFromScore(s: number): { grade: string; color: string } {
  if (s >= 85) return { grade: "A",  color: "#1baf7a" };
  if (s >= 70) return { grade: "B+", color: "#1baf7a" };
  if (s >= 55) return { grade: "B",  color: "#eda100" };
  if (s >= 40) return { grade: "C",  color: "#eb6834" };
  if (s >= 25) return { grade: "D",  color: "#e34948" };
  return               { grade: "F",  color: "#e34948" };
}

/* ── Radar chart (Chart.js) ───────────────────────────────────────────── */
function SecurityRadarChart({
  scores,
  findings,
}: {
  scores:   RadarScores;
  findings: Finding[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef  = useRef<any>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // FIX: the dynamic import below is async. If this effect is cleaned up
    // (React Strict Mode double-invoke, or `scores` changing) before the
    // import resolves, the cleanup finds chartRef.current === null and
    // destroys nothing — then BOTH pending imports create a chart on the
    // same canvas. This flag makes stale callbacks bail out.
    let cancelled = false;

    const dataValues = CATEGORIES.map(c => scores[c.key]);

    const isDark =
      document.documentElement.dataset.mode === "dark" ||
      (!document.documentElement.dataset.mode &&
        matchMedia("(prefers-color-scheme:dark)").matches);

    const gridColor     = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
    const labelColor    = isDark ? "#c3c2b7" : "#52514e";
    const tickColor     = "#898781";
    const tooltipBg     = isDark ? "#2c2c2a" : "#ffffff";
    const tooltipTitle  = isDark ? "#f0efec" : "#0b0b0b";
    const tooltipBody   = isDark ? "#c3c2b7" : "#52514e";
    const tooltipBorder = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)";
    const safeFill      = isDark ? "rgba(195,194,183,0.08)" : "rgba(0,0,0,0.04)";
    const pointFill     = "#e87ba4";
    const dataFill      = isDark ? "rgba(232,123,164,0.18)" : "rgba(232,123,164,0.14)";

    import("chart.js/auto").then(({ default: Chart }) => {
      if (cancelled) return;

      // FIX: belt-and-braces — destroy any chart Chart.js still has
      // registered on this canvas before creating a new one.
      Chart.getChart(canvas)?.destroy();
      chartRef.current?.destroy();

      chartRef.current = new Chart(canvas, {
        type: "radar",
        data: {
          labels: CATEGORIES.map(a => [a.label, `(${a.sub})`]),
          datasets: [
            {
              label: "Safe threshold",
              data:  [80, 80, 80, 80, 80, 80],
              borderColor:     isDark ? "rgba(195,194,183,0.30)" : "rgba(0,0,0,0.15)",
              borderWidth:     1.5,
              borderDash:      [6, 4],
              pointRadius:     0,
              backgroundColor: safeFill,
              fill:            true,
              order:           2,
            },
            {
              label:                "Security posture",
              data:                 dataValues,
              borderColor:          pointFill,
              borderWidth:          2,
              pointBackgroundColor: pointFill,
              pointBorderColor:     isDark ? "#1a1a19" : "#ffffff",
              pointBorderWidth:     2,
              pointRadius:          6,
              pointHoverRadius:     9,
              backgroundColor:      dataFill,
              fill:                 true,
              order:                1,
            },
          ],
        },
        options: {
          responsive:          true,
          maintainAspectRatio: false,
          scales: {
            r: {
              min: 0,
              max: 100,
              ticks: {
                stepSize:      20,
                color:         tickColor,
                font:          { size: 10 },
                backdropColor: "transparent",
              },
              grid:        { color: gridColor, lineWidth: 1 },
              angleLines:  { color: gridColor, lineWidth: 1 },
              pointLabels: {
                color:   labelColor,
                font:    { size: 11, weight: "normal" },
                padding: 10,
              },
            },
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: (ctx: any) => {
                  const raw = ctx[0]?.label ?? "";
                  return Array.isArray(raw) ? raw.join(" ") : raw;
                },
                label: (ctx: any) => {
                  if (ctx.dataset.label === "Safe threshold") return "";
                  const v = ctx.raw as number;
                  const status =
                    v >= 80 ? "Safe"    :
                    v >= 55 ? "Warning" :
                    v >= 30 ? "High"    : "Critical";
                  return ` Score: ${v} — ${status}`;
                },
              },
              backgroundColor: tooltipBg,
              titleColor:      tooltipTitle,
              bodyColor:       tooltipBody,
              borderColor:     tooltipBorder,
              borderWidth:     1,
              padding:         10,
              cornerRadius:    8,
            },
          },
        },
      });
    });

    return () => {
      cancelled = true;
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [scores]);

  return (
    <div>
      {/* chart */}
      <div style={{ position: "relative", width: "100%", height: "420px" }}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Radar chart showing security posture across 6 OWASP categories"
        >
          Security radar chart with 6 axes: Injection, Broken Auth, Cryptography,
          Misconfiguration, Exposed Data, Vulnerable Dependencies.
        </canvas>
      </div>

      {/* legend */}
      <div className="mt-3 flex items-center justify-center gap-5 text-[11.5px] text-white/40">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: "#e87ba4" }} />
          Security posture
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-white/20" />
          Safe threshold (80)
        </span>
      </div>

      {/* axis score cards */}
      <div className="mt-5 grid grid-cols-3 gap-2.5">
        {CATEGORIES.map((axis) => {
          const val   = scores[axis.key];
          const grade = gradeFromScore(val);
          const count = countForCategory(findings, axis.key);

          return (
            <div
              key={axis.key}
              className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-white/70">{axis.label}</p>
                <p className="text-[10px] text-white/25">{axis.sub}</p>
                {count > 0 && (
                  <p className="mt-0.5 text-[10px] text-white/30">
                    {count} finding{count !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-0.5 shrink-0 ml-2">
                <span
                  className="text-[18px] font-semibold leading-none"
                  style={{ color: grade.color }}
                >
                  {grade.grade}
                </span>
                <span className="text-[10px] text-white/25">{val}/100</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════════════ */
export function AttackGraphPage() {
  const { workspaceId }     = useWorkspace();
  const [findings,  setFindings ] = useState<Finding[]>([]);
  const [loading,   setLoading  ] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [scores,    setScores   ] = useState<RadarScores>({
    injection: 100, brokenAuth: 100, cryptography: 100,
    misconfiguration: 100, exposedData: 100, vulnerableDeps: 100,
  });

  const fetchData = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/sentra/findings?workspaceId=${workspaceId}`);
      const data = await res.json();
      const f: Finding[] = data.findings ?? [];
      setFindings(f);
      setScores(computeRadarScores(f));
    } catch (err) {
      console.error("Failed to load findings", err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const exportReport = async (format: "html" | "json") => {
    if (!workspaceId) return;
    setExporting(true);
    try {
      const res = await fetch(
        `/api/sentra/report?workspaceId=${workspaceId}&format=${format}`
      );
      if (!res.ok) return;
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `sentracode-report-${Date.now()}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  /* ── overall health score ────────────────────────────────────────── */
  const allVals      = Object.values(scores);
  const avgScore     = Math.round(allVals.reduce((s, v) => s + v, 0) / allVals.length);
  const overallGrade = gradeFromScore(avgScore);

  const criticals = findings.filter(f => f.severity === "CRITICAL").length;
  const warnings  = findings.filter(f => f.severity === "WARNING").length;
  const belowSafe = CATEGORIES.filter(c => scores[c.key] < 80);
  const weakest   = [...CATEGORIES].sort((a, b) => scores[a.key] - scores[b.key])[0];

  return (
    <div className="p-6 space-y-5">
      {/* header */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-white">Security posture</h1>
          <p className="mt-0.5 text-[12px] text-white/30">
            OWASP Top 10 coverage across all connected repositories
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchData}
            disabled={loading}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/40 hover:bg-white/8 disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => exportReport("html")}
            disabled={exporting}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11.5px] text-white/50 hover:bg-white/8 disabled:opacity-40 transition-colors"
          >
            <FileText className="h-3.5 w-3.5" />
            Export report
          </button>
          <button
            onClick={() => exportReport("json")}
            disabled={exporting}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11.5px] text-white/50 hover:bg-white/8 disabled:opacity-40 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            JSON
          </button>
        </div>
      </div>

      {/* overall health strip */}
      <div className="flex items-center gap-4 rounded-2xl border border-white/5 bg-white/[0.02] p-5">
        {/* grade circle */}
        <div
          className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4"
          style={{ borderColor: overallGrade.color + "40" }}
        >
          <div className="text-center">
            <p className="text-[26px] font-bold leading-none" style={{ color: overallGrade.color }}>
              {overallGrade.grade}
            </p>
            <p className="text-[10px] text-white/25 mt-0.5">{avgScore}/100</p>
          </div>
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-[13.5px] font-semibold text-white">
            {avgScore >= 80
              ? "Security posture is healthy"
              : avgScore >= 55
              ? "Security posture needs attention"
              : "Security posture is critical — immediate action required"}
          </p>
          <p className="text-[12px] text-white/35 leading-relaxed">
            {belowSafe.length === 0
              ? "All 6 OWASP categories are above the safe threshold of 80."
              : `${belowSafe.length} categor${belowSafe.length === 1 ? "y is" : "ies are"} below the safe threshold of 80. ` +
                `Weakest area: ${weakest.label} (score ${scores[weakest.key]}).`}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {criticals > 0 && (
              <SBadge sev="Critical">
                <AlertTriangle className="h-3 w-3" />{criticals} critical
              </SBadge>
            )}
            {warnings > 0 && (
              <SBadge sev="Warning">{warnings} warning</SBadge>
            )}
            {criticals === 0 && warnings === 0 && (
              <SBadge sev="Success">No open issues</SBadge>
            )}
          </div>
        </div>
      </div>

      {/* radar chart card */}
      <Card>
        <CardHead
          title="OWASP Top 10 radar"
          sub="Score 0–100 per category · higher = safer · dashed line = safe threshold (80)"
        />
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <SecurityRadarChart scores={scores} findings={findings} />
        )}
      </Card>

      {/* category breakdown table */}
      <Card>
        <CardHead
          title="Category breakdown"
          sub="Findings grouped by OWASP category and CWE"
        />
        {loading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-white/20" />
          </div>
        ) : findings.length === 0 ? (
          <div className="flex h-24 items-center justify-center">
            <p className="text-[12px] text-white/20">
              No findings yet — connect and scan a repository
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/5">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  {["Category", "OWASP", "Score", "Grade", "Findings", "Status"].map(h => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[10.5px] font-medium uppercase tracking-wider text-white/20"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CATEGORIES.map(row => {
                  const val     = scores[row.key];
                  const grade   = gradeFromScore(val);
                  const count   = countForCategory(findings, row.key);
                  const isBelow = val < 80;

                  return (
                    <tr
                      key={row.key}
                      className="border-b border-white/5 transition-colors hover:bg-white/[0.02] last:border-0"
                    >
                      <td className="px-4 py-3">
                        <p className="text-[12.5px] font-medium text-white/70">{row.label}</p>
                        <p className="text-[10.5px] text-white/25">{row.desc}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-[10.5px] text-white/35">
                          {row.owasp}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/5">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${val}%`, backgroundColor: grade.color }}
                            />
                          </div>
                          <span className="text-[11.5px] font-mono text-white/50">{val}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[15px] font-semibold" style={{ color: grade.color }}>
                          {grade.grade}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-white/50">
                        {count > 0
                          ? <span className="text-red-400">{count}</span>
                          : <span className="text-white/20">0</span>}
                      </td>
                      <td className="px-4 py-3">
                        {isBelow ? (
                          <SBadge sev={val < 40 ? "Critical" : "Warning"}>
                            {val < 40 ? "Critical" : "Below safe"}
                          </SBadge>
                        ) : (
                          <SBadge sev="Success">Safe</SBadge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* report export card */}
      <Card>
        <CardHead
          title="Security report"
          sub="Download full HTML report with all findings, SCA results, and category breakdown"
          action={
            <button
              onClick={() => exportReport("html")}
              disabled={exporting}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-[11.5px] font-medium text-white hover:bg-primary/90 disabled:opacity-40 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Download report
            </button>
          }
        />
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: "🛡", label: "Executive summary",     desc: "Risk grade, finding counts, scan coverage"   },
            { icon: "📊", label: "OWASP radar breakdown", desc: "Per-category scores with grade and findings" },
            { icon: "🔍", label: "Full findings table",   desc: "All issues with diffs and remediation"       },
            { icon: "📦", label: "Vulnerable deps (SCA)", desc: "CVE-matched dependency vulnerabilities"      },
            { icon: "🔑", label: "Secrets detected",      desc: "Redacted credential and token findings"      },
            { icon: "📈", label: "Repository health",     desc: "Per-repo risk scores and scan history"       },
          ].map(item => (
            <div key={item.label} className="rounded-xl border border-white/5 bg-white/[0.015] p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">{item.icon}</span>
                <p className="text-[12px] font-medium text-white/70">{item.label}</p>
              </div>
              <p className="text-[11px] text-white/30">{item.desc}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}