/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import {
  fetchRepoTree, fetchFileContent,
  fetchRepoCommits, computeRiskScore,
} from "@/lib/github";
import { scanFileForVulnerabilities } from "@/lib/sentra-scanner";

// POST — trigger a scan
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { repoId, workspaceId } = await req.json();

  const user = await db.user.findUnique({ where: { clerkId: userId } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const repo = await db.sentraRepo.findUnique({ where: { id: repoId } });
  if (!repo) return NextResponse.json({ error: "Repo not found" }, { status: 404 });

  // get GitHub token
  const settings = await db.sentraSettings.findUnique({ where: { workspaceId } });
  const token    = settings?.githubToken ?? undefined;

  // create scan record
  const scan = await db.sentraScan.create({
    data: {
      repoId,
      status:      "SCANNING",
      triggeredBy: "manual",
      branch:      repo.defaultBranch,
    },
  });

  // mark repo as scanning
  await db.sentraRepo.update({
    where: { id: repoId },
    data:  { scanStatus: "SCANNING" },
  });

  // run scan in background (fire-and-forget)
  runScan(scan.id, repo.owner, repo.repoName, repo.defaultBranch, token, workspaceId).catch(
    console.error
  );

  return NextResponse.json({ scanId: scan.id, message: "Scan started" });
}

async function runScan(
  scanId:      string,
  owner:       string,
  repoName:    string,
  branch:      string,
  token:       string | undefined,
  workspaceId: string
) {
  const startTime = Date.now();

  try {
    // get repo file tree
    const tree = await fetchRepoTree(owner, repoName, branch, token);

    // filter to scannable code files
    const codeExts = [
      ".py", ".js", ".ts", ".tsx", ".jsx",
      ".go", ".java", ".rb", ".php", ".cs",
      ".cpp", ".c", ".rs", ".swift", ".kt",
      ".env", ".yaml", ".yml", ".json", ".toml",
    ];
    const codeFiles = tree
      .filter(f => codeExts.some(e => f.path.endsWith(e)))
      .filter(f => !f.path.includes("node_modules") && !f.path.includes(".next"))
      .slice(0, 30); // cap at 30 files to avoid rate limits

    let filesScanned = 0;
    let allFindings: Array<ReturnType<typeof scanFileForVulnerabilities> extends Promise<infer T> ? T : never> = [];

    for (const file of codeFiles) {
      const content = await fetchFileContent(owner, repoName, file.path, token);
      if (!content) continue;

      const findings = await scanFileForVulnerabilities(file.path, content);
      allFindings.push(...findings as any);
      filesScanned++;

      // update scan progress
      await db.sentraScan.update({
        where: { id: scanId },
        data:  { filesScanned },
      });
    }

    // save all findings to DB
    const repo = await db.sentraRepo.findFirst({
      where: { owner, repoName },
    });
    if (!repo) return;

    // delete old findings from previous scans of this repo
    await db.sentraFinding.deleteMany({
      where: { repoId: repo.id, scan: { status: { in: ["COMPLETED", "FAILED"] } } },
    });

    for (const f of allFindings as any[]) {
      await db.sentraFinding.create({
        data: {
          repoId:      repo.id,
          scanId,
          severity:    f.severity,
          title:       f.title,
          description: f.description,
          filePath:    f.filePath,
          lineNumber:  f.lineNumber ?? null,
          cwe:         f.cwe ?? null,
          rule:        f.rule ?? null,
          snippet:     f.snippet ?? null,
          diffBefore:  f.diffBefore ?? null,
          diffAfter:   f.diffAfter ?? null,
          fix:         f.fix ?? null,
          status:      "OPEN",
        },
      });
    }

    // fetch and store recent commits
    const commits = await fetchRepoCommits(owner, repoName, token, 20);
    for (const c of commits) {
      try {
        await db.sentraCommit.upsert({
          where:  { repoId_sha: { repoId: repo.id, sha: c.sha } },
          update: {},
          create: {
            repoId:       repo.id,
            sha:          c.sha,
            message:      c.commit.message.split("\n")[0].slice(0, 200),
            authorName:   c.commit.author.name,
            authorEmail:  c.commit.author.email,
            branch:       "main",
            additions:    c.stats?.additions ?? 0,
            deletions:    c.stats?.deletions ?? 0,
            filesChanged: c.files?.length ?? 0,
            committedAt:  new Date(c.commit.author.date),
          },
        });
      } catch {}
    }

    // compute risk score
    const criticals = allFindings.filter((f: any) => f.severity === "CRITICAL").length;
    const warnings  = allFindings.filter((f: any) => f.severity === "WARNING").length;
    const riskScore = computeRiskScore(criticals, warnings);

    const duration = Math.round((Date.now() - startTime) / 1000);

    // complete scan
    await db.sentraScan.update({
      where: { id: scanId },
      data: {
        status:        "COMPLETED",
        filesScanned,
        findingsCount: allFindings.length,
        completedAt:   new Date(),
        duration,
      },
    });

    await db.sentraRepo.update({
      where: { id: repo.id },
      data: {
        scanStatus:   "COMPLETED",
        lastScanAt:   new Date(),
        riskScore,
        totalCommits: commits.length,
      },
    });
  } catch (err) {
    console.error("Scan failed:", err);
    await db.sentraScan.update({
      where: { id: scanId },
      data: {
        status:       "FAILED",
        errorMessage: (err as Error).message,
        completedAt:  new Date(),
      },
    });
    // find repo and mark failed
    const repo = await db.sentraRepo.findFirst({ where: { owner, repoName } });
    if (repo) {
      await db.sentraRepo.update({
        where: { id: repo.id },
        data:  { scanStatus: "FAILED" },
      });
    }
  }
}