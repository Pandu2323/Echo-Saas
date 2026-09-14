/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef } from "react";
import { StatCard, SBadge, DiffBlock, Card, CardHead } from "../sentra-ui";
import { ArrowRight, Server, AlertTriangle, CheckCheck, ShieldCheck } from "lucide-react";

export function OverviewPage({ onNavigate }: { onNavigate: (p: any) => void }) {
  const langRef = useRef<HTMLCanvasElement>(null);
  const chartInited = useRef(false);

  useEffect(() => {
    if (chartInited.current || !langRef.current) return;
    chartInited.current = true;
    import("chart.js/auto").then(({ default: Chart }) => {
      new Chart(langRef.current!, {
        type: "doughnut",
        data: {
          labels: ["TypeScript", "Python", "CSS", "HTML", "Other"],
          datasets: [{
            data: [42, 35, 10, 8, 5],
            backgroundColor: ["#378ADD", "#BA7517", "#8B5CF6", "#D85A30", "#5F5E5A"],
            borderWidth: 0,
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
  }, []);

  const findings = [
    { sev: "Critical" as const, title: "SQL injection risk in auth/login.py", repo: "sneakybuzz/patron", time: "2m ago" },
    { sev: "Warning"  as const, title: "Hardcoded API key in config/settings.js", repo: "sneakybuzz/echo", time: "18m ago" },
    { sev: "Info"     as const, title: "Outdated dependency lodash@4.17.15", repo: "sneakybuzz/loomx", time: "1h ago" },
    { sev: "Warning"  as const, title: "Missing rate limit on api/auth.py", repo: "sneakybuzz/sentenara", time: "3h ago" },
  ];

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-white">Overview</h1>
        <p className="text-[12px] text-white/30 mt-0.5">Security posture across all connected repositories · last 7 days</p>
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Repos scanned" value={128} trend="12% vs last week" trendDir="up"
          icon={<Server className="h-3.5 w-3.5 text-blue-400" />} />
        <StatCard label="Critical findings" value={7} trend="3 fewer than last week" trendDir="down"
          valueColor="text-red-400" icon={<AlertTriangle className="h-3.5 w-3.5 text-red-400" />} />
        <StatCard label="Auto-fixed" value={42} trend="8% vs last week" trendDir="up"
          valueColor="text-emerald-400" icon={<CheckCheck className="h-3.5 w-3.5 text-emerald-400" />} />
        <StatCard label="Risk score" value="B+" trend="Up from B last week" trendDir="up"
          icon={<ShieldCheck className="h-3.5 w-3.5 text-primary" />} />
      </div>

      {/* findings + donut */}
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
          <div className="divide-y divide-white/5">
            {findings.map((f, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <SBadge sev={f.sev}>{f.sev}</SBadge>
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] text-white/70">{f.title}</p>
                    <p className="text-[11px] text-white/25">{f.repo}</p>
                  </div>
                </div>
                <span className="shrink-0 text-[11px] text-white/25">{f.time}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHead title="Language exposure" />
          <canvas ref={langRef} height={160} />
        </Card>
      </div>

      {/* AI diff review */}
      <Card>
        <CardHead
          title="AI review · pull request #482"
          sub="sneakybuzz/patron"
          action={<SBadge sev="Critical"><AlertTriangle className="h-3 w-3" />1 critical issue</SBadge>}
        />
        <DiffBlock
          file="auth/login.py · line 42 · CWE-89 SQL Injection"
          lines={[
            { type: "-", text: '- query = "SELECT * FROM users WHERE id=" + user_id' },
            { type: "+", text: '+ query = "SELECT * FROM users WHERE id=%s", (user_id,)' },
            { type: "meta", text: "" },
            { type: "meta", text: "  Fix: Use parameterised queries to prevent SQL injection." },
          ]}
        />
      </Card>
    </div>
  );
}