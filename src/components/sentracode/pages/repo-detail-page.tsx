"use client";

import { useEffect, useRef } from "react";
import { StatCard, Card, CardHead } from "../sentra-ui";
import { ArrowRight } from "lucide-react";

const COMMITS = [
  { msg: "Add commit tracking dashboard UI", branch: "main", add: 218, del: 45, time: "2h ago", who: "PS", color: "#378ADD" },
  { msg: "Update repository overview component", branch: "feature/analytics", add: 136, del: 32, time: "5h ago", who: "AK", color: "#8B5CF6" },
  { msg: "Fix commit list pagination", branch: "main", add: 87, del: 12, time: "1d ago", who: "PS", color: "#378ADD" },
  { msg: "Add date range filter for commits", branch: "feature/filters", add: 64, del: 8, time: "1d ago", who: "SN", color: "#BA7517" },
  { msg: "Improve commit statistics calculation", branch: "main", add: 142, del: 27, time: "2d ago", who: "PS", color: "#378ADD" },
];

const CONTRIBUTORS = [
  { name: "Prashanth", commits: 18, pct: 64, color: "#378ADD" },
  { name: "Akshay",    commits: 6,  pct: 21, color: "#8B5CF6" },
  { name: "Sneha",     commits: 3,  pct: 11, color: "#BA7517" },
  { name: "Rahul",     commits: 1,  pct: 4,  color: "#639922" },
];

export function RepoDetailPage() {
  const barRef  = useRef<HTMLCanvasElement>(null);
  const langRef = useRef<HTMLCanvasElement>(null);
  const inited  = useRef(false);

  useEffect(() => {
    if (inited.current) return;
    inited.current = true;
    import("chart.js/auto").then(({ default: Chart }) => {
      if (barRef.current) {
        new Chart(barRef.current, {
          type: "bar",
          data: {
            labels: ["Sep 7","Sep 8","Sep 9","Sep 10","Sep 11","Sep 12","Sep 13"],
            datasets: [{ data: [4,7,5,9,12,8,6], backgroundColor: "#378ADD", borderRadius: 4, maxBarThickness: 24 }],
          },
          options: {
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { display: false }, border: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "rgba(255,255,255,0.3)", font: { size: 10 } } },
              y: { grid: { color: "rgba(255,255,255,0.04)" }, border: { display: false }, ticks: { color: "rgba(255,255,255,0.3)", font: { size: 10 } } },
            },
          },
        });
      }
      if (langRef.current) {
        new Chart(langRef.current, {
          type: "doughnut",
          data: {
            labels: ["TypeScript","Python","CSS","HTML","Other"],
            datasets: [{ data: [42,35,10,8,5], backgroundColor: ["#378ADD","#BA7517","#8B5CF6","#D85A30","#5F5E5A"], borderWidth: 0 }],
          },
          options: {
            cutout: "65%",
            plugins: { legend: { position: "right", labels: { boxWidth: 8, boxHeight: 8, padding: 10, color: "rgba(255,255,255,0.4)", font: { size: 11 } } } },
          },
        });
      }
    });
  }, []);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">sneakybuzz/patron</h1>
          <p className="mt-0.5 text-[12px] text-white/30">Commit tracking and development activity · last 7 days</p>
        </div>
        <select className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/50 focus:outline-none">
          <option>Last 7 days</option>
          <option>Last 30 days</option>
          <option>Last 90 days</option>
        </select>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Total commits" value={28}     trend="40%" trendDir="up" />
        <StatCard label="Active days"   value={6}      trend="50%" trendDir="up" />
        <StatCard label="Files changed" value={42}     trend="32%" trendDir="up" />
        <StatCard label="Lines changed" value="+1,248" trend="56%" trendDir="up" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="col-span-2">
          <CardHead title="Commit activity"
            action={<p className="text-[11px] text-white/25">Streak: <strong className="text-white/50">4d</strong> · Avg: <strong className="text-white/50">4/day</strong></p>}
          />
          <canvas ref={barRef} height={130} />
        </Card>
        <Card>
          <CardHead title="Language distribution" />
          <canvas ref={langRef} height={130} />
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="col-span-2">
          <CardHead title="Recent commits" action={<button className="flex items-center gap-1 text-[11.5px] text-primary hover:underline">View all <ArrowRight className="h-3 w-3" /></button>} />
          <div className="divide-y divide-white/5">
            {COMMITS.map((c, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9.5px] font-semibold text-white" style={{ backgroundColor: c.color }}>
                  {c.who}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-[12.5px] text-white/70">{c.msg}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="rounded bg-white/8 px-1.5 py-0.5 text-[10px] text-white/30">{c.branch}</span>
                    <span className="text-[10px] text-white/20">{c.time}</span>
                  </div>
                </div>
                <div className="shrink-0 text-[11.5px]">
                  <span className="text-emerald-400">+{c.add}</span>{" "}
                  <span className="text-red-400">-{c.del}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHead title="Top contributors" />
          <div className="space-y-2.5">
            {CONTRIBUTORS.map(c => (
              <div key={c.name} className="flex items-center gap-2.5">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9.5px] font-semibold text-white" style={{ backgroundColor: c.color }}>
                  {c.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="mb-1 flex justify-between text-[12px]">
                    <span className="text-white/60">{c.name}</span>
                    <span className="text-white/25">{c.commits}</span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full" style={{ width: `${c.pct}%`, backgroundColor: c.color }} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/5 pt-3">
            {[["Last commit", "2h ago"], ["Avg/day", "4.0"], ["Streak", "4 days"]].map(([k, v]) => (
              <div key={k}>
                <p className="text-[10px] text-white/25">{k}</p>
                <p className="mt-0.5 text-[12.5px] font-medium text-white">{v}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}