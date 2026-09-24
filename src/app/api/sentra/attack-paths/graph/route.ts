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

  if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });

  // fetch attack paths with all steps
  const attackPaths = await db.sentraAttackPath.findMany({
    where: {
      repo: { workspaceId },
      ...(repoId ? { repoId } : {}),
    },
    include: {
      repo: { select: { fullName: true, id: true } },
    },
    orderBy: { cvssScore: "desc" },
    take: 10,
  });

  // fetch findings for node enrichment
  const findings = await db.sentraFinding.findMany({
    where: {
      repo: { workspaceId },
      ...(repoId ? { repoId } : {}),
      status: { in: ["OPEN", "IN_REVIEW"] },
    },
    select: {
      id: true, filePath: true, severity: true,
      title: true, lineNumber: true, cwe: true,
    },
    take: 100,
  });

  // build graph nodes and edges from attack paths
  const nodeMap = new Map<string, any>();
  const edges:   any[] = [];

  // add finding nodes
  for (const f of findings) {
    const key = f.filePath;
    if (!nodeMap.has(key)) {
      nodeMap.set(key, {
        id:       key,
        label:    f.filePath.split("/").pop() ?? f.filePath,
        fullPath: f.filePath,
        type:     "file",
        severity: f.severity,
        findings: [],
        x: Math.random() * 800,
        y: Math.random() * 500,
      });
    }
    nodeMap.get(key).findings.push({
      id:         f.id,
      title:      f.title,
      severity:   f.severity,
      lineNumber: f.lineNumber,
      cwe:        f.cwe,
    });
    // upgrade node severity if worse
    const RANK: Record<string, number> = { CRITICAL: 3, WARNING: 2, INFO: 1 };
    if ((RANK[f.severity] ?? 0) > (RANK[nodeMap.get(key).severity] ?? 0)) {
      nodeMap.get(key).severity = f.severity;
    }
  }

  // add attack path edges
  for (const ap of attackPaths) {
    const steps = (ap.steps as any[]) ?? [];

    for (let i = 0; i < steps.length - 1; i++) {
      const from = steps[i].file;
      const to   = steps[i + 1].file;

      if (!from || !to) continue;

      // ensure nodes exist
      for (const key of [from, to]) {
        if (!nodeMap.has(key)) {
          nodeMap.set(key, {
            id:       key,
            label:    key.split("/").pop() ?? key,
            fullPath: key,
            type:     "file",
            severity: "INFO",
            findings: [],
            x: Math.random() * 800,
            y: Math.random() * 500,
          });
        }
      }

      edges.push({
        id:           `${ap.id}-${i}`,
        source:       from,
        target:       to,
        label:        steps[i + 1].action ?? "",
        attackPathId: ap.id,
        severity:     ap.severity,
        stepNumber:   i + 1,
      });
    }
  }

  // add attacker entry + goal nodes
  if (edges.length > 0) {
    nodeMap.set("__attacker__", {
      id:       "__attacker__",
      label:    "Attacker",
      fullPath: "",
      type:     "attacker",
      severity: "CRITICAL",
      findings: [],
      x: 50,
      y: 250,
    });

    nodeMap.set("__goal__", {
      id:       "__goal__",
      label:    "Goal achieved",
      fullPath: "",
      type:     "goal",
      severity: "CRITICAL",
      findings: [],
      x: 900,
      y: 250,
    });

    // connect attacker to first file of first attack path
    const firstStep = (attackPaths[0]?.steps as any[])?.[0];
    if (firstStep?.file) {
      edges.unshift({
        id:       "attacker-entry",
        source:   "__attacker__",
        target:   firstStep.file,
        label:    "Initial access",
        severity: "CRITICAL",
        stepNumber: 0,
      });
    }

    // connect last step of most critical path to goal
    const lastPath  = attackPaths[0];
    const lastSteps = (lastPath?.steps as any[]) ?? [];
    const lastFile  = lastSteps[lastSteps.length - 1]?.file;
    if (lastFile) {
      edges.push({
        id:       "last-goal",
        source:   lastFile,
        target:   "__goal__",
        label:    lastPath.businessImpact?.slice(0, 30) ?? "Compromise",
        severity: "CRITICAL",
        stepNumber: 999,
      });
    }
  }

  return NextResponse.json({
    nodes:       Array.from(nodeMap.values()),
    edges,
    attackPaths: attackPaths.map(ap => ({
      id:            ap.id,
      title:         ap.title,
      severity:      ap.severity,
      cvssScore:     ap.cvssScore,
      businessImpact:ap.businessImpact,
      remediation:   ap.remediation,
      stepCount:     ((ap.steps as any[]) ?? []).length,
    })),
  });
}