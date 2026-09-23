/* eslint-disable @typescript-eslint/no-explicit-any */
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId");
  const repoId      = searchParams.get("repoId");
  const format      = searchParams.get("format") ?? "json";

  if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });

  const user = await db.user.findUnique({ where: { clerkId: userId } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const repoWhere = { workspaceId, ...(repoId ? { id: repoId } : {}) };

  const [repos, findings, attackPaths, scaFindings, secretFindings, scans] =
    await Promise.all([
      db.sentraRepo.findMany({ where: repoWhere }),
      db.sentraFinding.findMany({
        where:   { repo: repoWhere, status: { in: ["OPEN", "IN_REVIEW"] } },
        include: { repo: { select: { fullName: true } } },
        orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
        take:    100,
      }),
      db.sentraAttackPath.findMany({
        where:   { repo: repoWhere },
        orderBy: { cvssScore: "desc" },
        take:    10,
      }),
      db.sentraSCAFinding.findMany({
        where:   { repo: repoWhere, status: "OPEN" },
        orderBy: { severity: "asc" },
        take:    50,
      }),
      db.sentraSecretFinding.findMany({
        where:   { repo: repoWhere, status: "OPEN" },
        take:    20,
      }),
      db.sentraScan.findMany({
        where:   { repo: repoWhere, status: "COMPLETED" },
        orderBy: { completedAt: "desc" },
        take:    5,
      }),
    ]);

  const criticals = findings.filter(f => f.severity === "CRITICAL").length;
  const warnings  = findings.filter(f => f.severity === "WARNING").length;
  const infos     = findings.filter(f => f.severity === "INFO").length;
  const avgRisk   = repos.map(r => r.riskScore).filter(Boolean)[0] ?? "N/A";

  const report = {
    meta: {
      generatedAt:   new Date().toISOString(),
      generatedBy:   user.email,
      workspaceId,
      reportTitle:   "SentraCode Security Report",
      classification:"CONFIDENTIAL",
    },
    executiveSummary: {
      totalRepos:       repos.length,
      scannedRepos:     repos.filter(r => r.scanStatus === "COMPLETED").length,
      totalFindings:    findings.length,
      criticalFindings: criticals,
      warningFindings:  warnings,
      infoFindings:     infos,
      attackChains:     attackPaths.length,
      vulnerableDeps:   scaFindings.length,
      secretsFound:     secretFindings.length,
      overallRisk:      avgRisk,
      lastScanDate:     scans[0]?.completedAt?.toISOString() ?? null,
    },
    repositories: repos.map(r => ({
      name:       r.fullName,
      language:   r.language,
      riskScore:  r.riskScore,
      lastScan:   r.lastScanAt?.toISOString() ?? null,
      scanStatus: r.scanStatus,
    })),
    findings: findings.map(f => ({
      id:          f.id,
      severity:    f.severity,
      title:       f.title,
      description: f.description,
      file:        f.filePath,
      line:        f.lineNumber,
      cwe:         f.cwe,
      status:      f.status,
      repo:        f.repo.fullName,
      fix:         f.aiFix,
      diffBefore:  f.diffBefore,
      diffAfter:   f.diffAfter,
    })),
    attackPaths: attackPaths.map(ap => ({
      title:         ap.title,
      severity:      ap.severity,
      description:   ap.description,
      cvssScore:     ap.cvssScore,
      steps:         ap.steps,
      businessImpact:ap.businessImpact,
      remediation:   ap.remediation,
    })),
    vulnerableDependencies: scaFindings.map(f => ({
      package:    f.packageName,
      version:    f.packageVersion,
      ecosystem:  f.ecosystem,
      cve:        f.vulnerabilityId,
      severity:   f.severity,
      title:      f.title,
      fixVersion: f.fixedVersion,
      file:       f.manifestFile,
    })),
    secretsDetected: secretFindings.map(f => ({
      type:    f.secretType,
      file:    f.filePath,
      line:    f.lineNumber,
      snippet: f.snippet, // already redacted
    })),
  };

  if (format === "html") {
    const html = buildHTMLReport(report);
    return new Response(html, {
      headers: {
        "Content-Type":        "text/html",
        "Content-Disposition": `attachment; filename="sentracode-report-${Date.now()}.html"`,
      },
    });
  }

  return NextResponse.json(report);
}

function buildHTMLReport(report: any): string {
  const { meta, executiveSummary: es, findings, attackPaths } = report;

  const SEV_COLOR: Record<string, string> = {
    CRITICAL: "#EF4444",
    WARNING:  "#F59E0B",
    INFO:     "#3B82F6",
  };

  const criticalRows = findings
    .filter((f: any) => f.severity === "CRITICAL")
    .map((f: any) => `
      <tr>
        <td style="color:${SEV_COLOR[f.severity]};font-weight:bold">${f.severity}</td>
        <td>${f.title}</td>
        <td style="font-family:monospace;font-size:12px">${f.file}${f.line ? `:${f.line}` : ""}</td>
        <td style="font-family:monospace;font-size:11px">${f.cwe ?? "—"}</td>
        <td>${f.repo}</td>
      </tr>
    `).join("");

  const attackPathSection = attackPaths.map((ap: any, i: number) => `
    <div style="border:1px solid ${SEV_COLOR[ap.severity] ?? '#888'};border-radius:8px;padding:16px;margin-bottom:12px;background:#0d0d0d">
      <h3 style="color:${SEV_COLOR[ap.severity] ?? '#F59E0B'};margin:0 0 8px">${i+1}. ${ap.title}</h3>
      ${ap.cvssScore ? `<p style="color:#888;font-size:12px">CVSS Score: <strong style="color:${SEV_COLOR[ap.severity]}">${ap.cvssScore}</strong></p>` : ""}
      <p style="color:#aaa;font-size:13px">${ap.description}</p>
      <div style="margin-top:12px">
        ${(ap.steps ?? []).map((s: any) => `
          <div style="display:flex;gap:12px;margin-bottom:8px;padding:8px;background:#111;border-radius:6px">
            <span style="color:#666;font-weight:bold;min-width:20px">${s.stepNumber}.</span>
            <div>
              <p style="color:#ddd;margin:0;font-size:13px">${s.action}</p>
              <p style="color:#888;margin:2px 0 0;font-size:11px">${s.description}</p>
              ${s.file ? `<code style="color:#7C3AED;font-size:10px">${s.file}${s.line ? `:${s.line}` : ""}</code>` : ""}
            </div>
          </div>
        `).join("")}
      </div>
      ${ap.businessImpact ? `<p style="color:#F59E0B;font-size:12px;margin-top:8px"><strong>Impact:</strong> ${ap.businessImpact}</p>` : ""}
      ${ap.remediation ? `<p style="color:#10B981;font-size:12px"><strong>Fix:</strong> ${ap.remediation}</p>` : ""}
    </div>
  `).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SentraCode Security Report</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0a0a0a; color: #e0e0e0; font-family: system-ui, -apple-system, sans-serif; padding: 40px; }
  h1, h2, h3 { color: #fff; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th { text-align: left; padding: 8px 12px; background: #111; color: #666; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; border-bottom: 1px solid #222; }
  td { padding: 10px 12px; border-bottom: 1px solid #1a1a1a; font-size: 13px; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .card { background: #111; border: 1px solid #222; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
  .stat { background: #0d0d0d; border: 1px solid #1a1a1a; border-radius: 8px; padding: 16px; text-align: center; }
  .stat-value { font-size: 32px; font-weight: bold; color: #fff; }
  .stat-label { font-size: 11px; color: #555; margin-top: 4px; text-transform: uppercase; }
  .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; }
  @media print { body { background: #fff; color: #000; } }
</style>
</head>
<body>

<div style="display:flex;align-items:center;gap:16px;margin-bottom:32px;padding-bottom:24px;border-bottom:1px solid #222">
  <div style="background:#7C3AED;width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px">🛡</div>
  <div>
    <h1 style="font-size:24px">SentraCode Security Report</h1>
    <p style="color:#555;font-size:13px">Generated ${new Date(meta.generatedAt).toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"})} · ${meta.generatedBy} · CONFIDENTIAL</p>
  </div>
</div>

<div class="card">
  <h2 style="margin-bottom:16px">Executive Summary</h2>
  <div class="grid-4">
    <div class="stat"><div class="stat-value" style="color:#EF4444">${es.criticalFindings}</div><div class="stat-label">Critical findings</div></div>
    <div class="stat"><div class="stat-value" style="color:#F59E0B">${es.warningFindings}</div><div class="stat-label">Warnings</div></div>
    <div class="stat"><div class="stat-value">${es.attackChains}</div><div class="stat-label">Attack chains</div></div>
    <div class="stat"><div class="stat-value" style="color:${es.overallRisk?.startsWith('A') ? '#10B981' : es.overallRisk?.startsWith('B') ? '#F59E0B' : '#EF4444'}">${es.overallRisk}</div><div class="stat-label">Risk grade</div></div>
  </div>
  <div class="grid-4" style="margin-top:8px">
    <div class="stat"><div class="stat-value">${es.scannedRepos}/${es.totalRepos}</div><div class="stat-label">Repos scanned</div></div>
    <div class="stat"><div class="stat-value">${es.vulnerableDeps}</div><div class="stat-label">Vulnerable deps</div></div>
    <div class="stat"><div class="stat-value" style="color:${es.secretsFound > 0 ? '#EF4444' : '#10B981'}">${es.secretsFound}</div><div class="stat-label">Secrets found</div></div>
    <div class="stat"><div class="stat-value">${es.totalFindings}</div><div class="stat-label">Total findings</div></div>
  </div>
</div>

${attackPaths.length > 0 ? `
<div class="card">
  <h2 style="margin-bottom:16px;color:#EF4444">⚠ Attack Chains</h2>
  ${attackPathSection}
</div>` : ""}

<div class="card">
  <h2 style="margin-bottom:16px">Security Findings</h2>
  <table>
    <thead><tr><th>Severity</th><th>Finding</th><th>File</th><th>CWE</th><th>Repository</th></tr></thead>
    <tbody>
      ${findings.map((f: any) => `
        <tr>
          <td><span class="badge" style="background:${SEV_COLOR[f.severity]}22;color:${SEV_COLOR[f.severity]}">${f.severity}</span></td>
          <td>${f.title}</td>
          <td style="font-family:monospace;font-size:11px;color:#888">${f.file}${f.line ? `:${f.line}` : ""}</td>
          <td style="font-family:monospace;font-size:11px;color:#666">${f.cwe ?? "—"}</td>
          <td style="color:#888">${f.repo}</td>
        </tr>
        ${(f.diffBefore || f.diffAfter) ? `
        <tr>
          <td colspan="5" style="padding:0 12px 12px">
            <div style="background:#0a0a0a;border-radius:6px;padding:12px;font-family:monospace;font-size:11px;margin-top:4px">
              ${f.diffBefore ? `<div style="color:#EF4444">${f.diffBefore.replace(/</g,"&lt;")}</div>` : ""}
              ${f.diffAfter  ? `<div style="color:#10B981">${f.diffAfter.replace(/</g,"&lt;")}</div>`  : ""}
              ${f.fix ? `<div style="color:#666;margin-top:4px;font-style:italic"># ${f.fix}</div>` : ""}
            </div>
          </td>
        </tr>` : ""}
      `).join("")}
    </tbody>
  </table>
</div>

${report.vulnerableDependencies.length > 0 ? `
<div class="card">
  <h2 style="margin-bottom:16px">Vulnerable Dependencies (SCA)</h2>
  <table>
    <thead><tr><th>Package</th><th>Version</th><th>CVE</th><th>Severity</th><th>Fix</th><th>File</th></tr></thead>
    <tbody>
      ${report.vulnerableDependencies.map((d: any) => `
        <tr>
          <td style="font-family:monospace">${d.package}</td>
          <td style="font-family:monospace;color:#888">${d.version}</td>
          <td style="font-family:monospace;font-size:11px;color:#7C3AED">${d.cve ?? "—"}</td>
          <td><span class="badge" style="background:${SEV_COLOR[d.severity]}22;color:${SEV_COLOR[d.severity]}">${d.severity}</span></td>
          <td style="font-family:monospace;color:#10B981">${d.fixVersion ?? "No fix"}</td>
          <td style="font-family:monospace;font-size:11px;color:#555">${d.file}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>
</div>` : ""}

${report.secretsDetected.length > 0 ? `
<div class="card" style="border-color:#EF444440">
  <h2 style="margin-bottom:16px;color:#EF4444">🔑 Secrets Detected</h2>
  <table>
    <thead><tr><th>Type</th><th>File</th><th>Line</th><th>Snippet (redacted)</th></tr></thead>
    <tbody>
      ${report.secretsDetected.map((s: any) => `
        <tr>
          <td style="color:#F59E0B">${s.type}</td>
          <td style="font-family:monospace;font-size:11px">${s.file}</td>
          <td style="font-family:monospace">${s.line ?? "—"}</td>
          <td style="font-family:monospace;font-size:11px;color:#888">${s.snippet ?? "—"}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>
</div>` : ""}

<div style="margin-top:32px;padding-top:24px;border-top:1px solid #222;text-align:center;color:#333;font-size:11px">
  Generated by SentraCode AI Security Platform · ${meta.generatedAt} · CONFIDENTIAL — internal use only
</div>

</body>
</html>`;
}