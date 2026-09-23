"use client";

import { useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { Card, CardHead } from "../sentra-ui";
import { AttackGraph } from "../attack-graph";
import { Download, FileText, ExternalLink } from "lucide-react";

export function AttackGraphPage() {
  const { workspaceId }   = useWorkspace();
  const [exporting, setExporting] = useState(false);

  const exportReport = async (format: "html" | "json") => {
    if (!workspaceId) return;
    setExporting(true);
    try {
      const res = await fetch(
        `/api/sentra/report?workspaceId=${workspaceId}&format=${format}`
      );
      if (!res.ok) return;

      if (format === "html") {
        const blob     = await res.blob();
        const url      = URL.createObjectURL(blob);
        const a        = document.createElement("a");
        a.href         = url;
        a.download     = `sentracode-report-${Date.now()}.html`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href     = url;
        a.download = `sentracode-report-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-6 space-y-5">
      {/* header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Attack Graph</h1>
          <p className="mt-0.5 text-[12px] text-white/30">
            AI-identified multi-step attack chains across your repositories
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportReport("html")}
            disabled={exporting}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11.5px] text-white/50 hover:bg-white/8 disabled:opacity-40 transition-colors"
          >
            <FileText className="h-3.5 w-3.5" />
            Export HTML report
          </button>
          <button
            onClick={() => exportReport("json")}
            disabled={exporting}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11.5px] text-white/50 hover:bg-white/8 disabled:opacity-40 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export JSON
          </button>
        </div>
      </div>

      {/* graph */}
      <Card>
        <CardHead
          title="Interactive attack graph"
          sub="Drag nodes · Click to inspect findings · Scroll to zoom"
        />
        <AttackGraph />
      </Card>

      {/* report preview panel */}
      <Card>
        <CardHead
          title="Security report"
          sub="Download a full HTML report with executive summary, findings, attack paths, and SCA results"
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
            { icon: "🛡", label: "Executive summary",    desc: "Risk grade, finding counts, scan coverage"     },
            { icon: "⚠",  label: "Attack chains",        desc: "Multi-step attack paths with CVSS scores"      },
            { icon: "🔍", label: "Full findings table",  desc: "All issues with code diffs and remediation"    },
            { icon: "📦", label: "Vulnerable deps (SCA)",desc: "CVE-matched dependency vulnerabilities"        },
            { icon: "🔑", label: "Secrets detected",     desc: "Redacted credential and token findings"        },
            { icon: "📊", label: "Repository health",    desc: "Per-repo risk scores and scan history"         },
          ].map(item => (
            <div key={item.label} className="rounded-xl border border-white/5 bg-white/[0.015] p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{item.icon}</span>
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