"use client";

import { Fragment, useState } from "react";
import { Download, ChevronRight, Check, GitPullRequest, X } from "lucide-react";
import { SBadge, DiffBlock, Card } from "../sentra-ui";

type Sev    = "Critical" | "Warning" | "Info";
type Status = "Open" | "In review" | "Fixed";

interface Vuln {
  sev: Sev; title: string; file: string;
  line: number; repo: string;
  status: Status; age: string;
  diff: { file: string; lines: { type: "+" | "-" | " " | "meta"; text: string }[] };
}

const STATUS_SEV: Record<Status, "Critical" | "Warning" | "Success"> = {
  "Open": "Critical", "In review": "Warning", "Fixed": "Success",
};

const VULNS: Vuln[] = [
  {
    sev: "Critical", title: "SQL injection risk", file: "auth/login.py", line: 42,
    repo: "patron", status: "Open", age: "2m",
    diff: { file: "auth/login.py:42 · CWE-89", lines: [
      { type: "-", text: '- query = "SELECT * FROM users WHERE id=" + user_id' },
      { type: "+", text: '+ query = "SELECT * FROM users WHERE id=%s", (user_id,)' },
    ]},
  },
  {
    sev: "Warning", title: "Hardcoded API key", file: "config/settings.js", line: 8,
    repo: "echo", status: "Open", age: "18m",
    diff: { file: "config/settings.js:8", lines: [
      { type: "-", text: '- const API_KEY = "sk-prod-abc123xyz";' },
      { type: "+", text: "+ const API_KEY = process.env.API_KEY;" },
    ]},
  },
  {
    sev: "Info", title: "Outdated dependency lodash@4.17.15", file: "package.json", line: 23,
    repo: "loomx", status: "Open", age: "1h",
    diff: { file: "package.json", lines: [
      { type: "-", text: '- "lodash": "^4.17.15"' },
      { type: "+", text: '+ "lodash": "^4.17.21"' },
    ]},
  },
  {
    sev: "Warning", title: "Missing rate limit", file: "api/auth.py", line: 15,
    repo: "sentenara", status: "In review", age: "3h",
    diff: { file: "api/auth.py:15", lines: [
      { type: "-", text: '- @app.route("/login", methods=["POST"])' },
      { type: "+", text: '+ @limiter.limit("10 per minute")' },
      { type: "+", text: '+ @app.route("/login", methods=["POST"])' },
    ]},
  },
  {
    sev: "Critical", title: "Insecure deserialization", file: "utils/pickle_loader.py", line: 61,
    repo: "networksecurity", status: "Open", age: "6h",
    diff: { file: "utils/pickle_loader.py:61 · CWE-502", lines: [
      { type: "-", text: "- data = pickle.loads(user_input)" },
      { type: "+", text: "+ data = json.loads(user_input)" },
    ]},
  },
  {
    sev: "Info", title: "Missing type hints", file: "model/predict.py", line: 3,
    repo: "product-price-predictor", status: "Fixed", age: "1d",
    diff: { file: "model/predict.py:3", lines: [
      { type: "-", text: "- def predict(features):" },
      { type: "+", text: "+ def predict(features: list[float]) -> float:" },
    ]},
  },
];

export function VulnerabilitiesPage() {
  const [sevFilter,    setSevFilter   ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expanded,     setExpanded    ] = useState<number | null>(null);

  const filtered = VULNS.filter(v =>
    (!sevFilter    || v.sev    === sevFilter)    &&
    (!statusFilter || v.status === statusFilter)
  );

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Vulnerabilities</h1>
          <p className="mt-0.5 text-[12px] text-white/30">34 open findings across 128 scanned repositories</p>
        </div>
        <div className="flex gap-2">
          <select
            value={sevFilter}
            onChange={e => setSevFilter(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/50 focus:outline-none"
          >
            <option value="">All severities</option>
            <option value="Critical">Critical</option>
            <option value="Warning">Warning</option>
            <option value="Info">Info</option>
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/50 focus:outline-none"
          >
            <option value="">All statuses</option>
            <option value="Open">Open</option>
            <option value="In review">In review</option>
            <option value="Fixed">Fixed</option>
          </select>
          <button className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/40 hover:bg-white/8 transition-colors">
            <Download className="h-3.5 w-3.5" />Export
          </button>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              {["Severity","Finding","Repository","Status","Age",""].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[10.5px] font-medium uppercase tracking-wider text-white/20">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((v, i) => (
              <Fragment key={`${v.repo}-${v.file}-${v.line}`}>
                <tr
                  key={i}
                  onClick={() => setExpanded(expanded === i ? null : i)}
                  className="cursor-pointer border-b border-white/5 transition-colors hover:bg-white/[0.02] last:border-0"
                >
                  <td className="px-4 py-3"><SBadge sev={v.sev}>{v.sev}</SBadge></td>
                  <td className="px-4 py-3">
                    <p className="text-[12.5px] text-white/70">{v.title}</p>
                    <p className="font-mono text-[11px] text-white/25">{v.file}:{v.line}</p>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-white/40">sneakybuzz/{v.repo}</td>
                  <td className="px-4 py-3"><SBadge sev={STATUS_SEV[v.status]}>{v.status}</SBadge></td>
                  <td className="px-4 py-3 text-[11.5px] text-white/25">{v.age}</td>
                  <td className="px-4 py-3">
                    <ChevronRight className={`h-4 w-4 text-white/15 transition-transform ${expanded === i ? "rotate-90" : ""}`} />
                  </td>
                </tr>
                {expanded === i && (
                  <tr key={`e-${i}`} className="border-b border-white/5 last:border-0">
                    <td colSpan={6} className="px-4 pb-4 pt-2">
                      <div className="rounded-xl border border-white/5 bg-white/[0.015] p-4 space-y-3">
                        <p className="text-[11.5px] font-medium text-white/30 uppercase tracking-wider">AI remediation suggestion</p>
                        <DiffBlock file={v.diff.file} lines={v.diff.lines} />
                        <div className="flex gap-2">
                          <button className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-[11.5px] font-medium text-white hover:bg-primary/90">
                            <GitPullRequest className="h-3.5 w-3.5" />Create PR from fix
                          </button>
                          <button className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[11.5px] text-white/50 hover:bg-white/8">
                            <Check className="h-3.5 w-3.5" />Mark fixed
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); setExpanded(null); }}
                            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[11.5px] text-white/30 hover:bg-white/8"
                          >
                            <X className="h-3.5 w-3.5" />Ignore
                          </button>
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
    </div>
  );
}