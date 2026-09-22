/* eslint-disable @typescript-eslint/no-explicit-any */
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { fetchFileContent } from "@/lib/github";
import {
  createBranch, commitFile, createPullRequest,
} from "@/lib/github-pr";

const SCANNER_URL = process.env.SENTRA_SCANNER_URL ?? "http://localhost:8001";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { findingId, workspaceId, createPR = false } = await req.json();

  if (!findingId || !workspaceId) {
    return NextResponse.json({ error: "findingId and workspaceId required" }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { clerkId: userId } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // get the finding with its repo
  const finding = await db.sentraFinding.findUnique({
    where:   { id: findingId },
    include: { repo: true },
  });

  if (!finding) return NextResponse.json({ error: "Finding not found" }, { status: 404 });
  if (finding.repo.workspaceId !== workspaceId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // get GitHub token
  const settings = await db.sentraSettings.findUnique({ where: { workspaceId } });
  const token    = settings?.githubToken;
  if (!token) {
    return NextResponse.json(
      { error: "GitHub token required. Add it in SentraCode Settings." },
      { status: 400 }
    );
  }

  // mark fix as pending
  const fixRecord = await db.sentraFixVerification.upsert({
    where:  { findingId },
    update: { status: "PENDING" },
    create: {
      findingId,
      status: "PENDING",
    },
  });

  // run fix pipeline in background
  runFixPipeline(
    finding, fixRecord.id, token, workspaceId, createPR
  ).catch(console.error);

  return NextResponse.json({
    fixId:   fixRecord.id,
    message: "Fix generation started",
    status:  "PENDING",
  });
}

async function runFixPipeline(
  finding:     any,
  fixId:       string,
  token:       string,
  workspaceId: string,
  createPR:    boolean
) {
  try {
    // ── Step 1: fetch original file content from GitHub ──────────────
    const originalContent = await fetchFileContent(
      finding.repo.owner,
      finding.repo.repoName,
      finding.filePath,
      token
    );

    if (!originalContent) {
      await db.sentraFixVerification.update({
        where: { id: fixId },
        data: {
          status:    "FAILED",
          patchDiff: null,
        },
      });
      return;
    }

    await db.sentraFixVerification.update({
      where: { id: fixId },
      data:  { originalCode: originalContent.slice(0, 5000) },
    });

    // ── Step 2: generate fix via Fix Agent ───────────────────────────
    const findingForAgent = {
      title:       finding.title,
      description: finding.description,
      cwe:         finding.cwe,
      lineNumber:  finding.lineNumber,
      snippet:     finding.snippet,
      remediation: finding.fix,
      filePath:    finding.filePath,
      ruleId:      finding.rule,
    };

    const fixRes = await fetch(`${SCANNER_URL}/ai/fix`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        finding:      findingForAgent,
        file_path:    finding.filePath,
        file_content: originalContent,
      }),
    });

    if (!fixRes.ok) {
      await db.sentraFixVerification.update({
        where: { id: fixId },
        data:  { status: "FAILED" },
      });
      return;
    }

    const fixData = await fixRes.json();

    if (!fixData.fixedContent) {
      await db.sentraFixVerification.update({
        where: { id: fixId },
        data:  { status: "FAILED" },
      });
      return;
    }

    await db.sentraFixVerification.update({
      where: { id: fixId },
      data: {
        status:     "GENERATED",
        fixedCode:  fixData.fixedContent.slice(0, 5000),
        patchDiff:  fixData.patchDiff ?? null,
      },
    });

    // ── Step 3: verify the fix ────────────────────────────────────────
    const verifyRes = await fetch(`${SCANNER_URL}/ai/verify`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        original_finding:  findingForAgent,
        original_content:  originalContent,
        fixed_content:     fixData.fixedContent,
        file_path:         finding.filePath,
      }),
    });

    let verifyData: any = {
      status:            "RESOLVED",
      verificationNotes: "Verification skipped.",
    };

    if (verifyRes.ok) {
      verifyData = await verifyRes.json();
    }

    await db.sentraFixVerification.update({
      where: { id: fixId },
      data: {
        verificationStatus: verifyData.status,
        verificationNotes:  verifyData.verificationNotes ?? null,
        reScanFindingCount: verifyData.newFindingsCount ?? 0,
      },
    });

    // ── Step 4: create GitHub PR (optional) ──────────────────────────
    if (createPR && verifyData.status !== "REGRESSION") {
      const branchName = `sentra/fix-${finding.id.slice(0, 8)}-${Date.now()}`;
      const baseBranch = finding.repo.defaultBranch;

      const branchCreated = await createBranch({
        owner:      finding.repo.owner,
        repo:       finding.repo.repoName,
        branchName,
        baseBranch,
        token,
      });

      if (branchCreated) {
        await commitFile({
          owner:    finding.repo.owner,
          repo:     finding.repo.repoName,
          branch:   branchName,
          filePath: finding.filePath,
          content:  fixData.fixedContent,
          message:  `fix(security): ${finding.title} [SentraCode AI Fix]\n\n${fixData.explanation ?? ""}\n\nFixes: ${finding.cwe ?? "security vulnerability"}\nVerification: ${verifyData.status}`,
          token,
        });

        const prBody = `## SentraCode AI Security Fix

**Vulnerability:** ${finding.title}
**CWE:** ${finding.cwe ?? "N/A"}
**File:** \`${finding.filePath}\`${finding.lineNumber ? `:${finding.lineNumber}` : ""}
**Severity:** ${finding.severity}

### What was fixed
${fixData.explanation ?? "Automated security fix generated by SentraCode AI."}

### Patch
\`\`\`diff
${fixData.patchDiff ?? "See file changes"}
\`\`\`

### Verification result
**Status:** ${verifyData.status}
${verifyData.verificationNotes ?? ""}

---
*Generated by [SentraCode](https://github.com) AI Security Platform*`;

        const pr = await createPullRequest({
          owner: finding.repo.owner,
          repo:  finding.repo.repoName,
          title: `[SentraCode] Fix: ${finding.title}`,
          body:  prBody,
          head:  branchName,
          base:  baseBranch,
          token,
        });

        if (pr) {
          await db.sentraFixVerification.update({
            where: { id: fixId },
            data: {
              status:     "PR_CREATED",
              prUrl:      pr.url,
              prNumber:   pr.number,
              branchName,
            },
          });

          // update finding status
          await db.sentraFinding.update({
            where: { id: finding.id },
            data:  { status: "IN_REVIEW" },
          });
        }
      }
    }

    // if verified as resolved without PR
    if (!createPR && verifyData.status === "RESOLVED") {
      await db.sentraFixVerification.update({
        where: { id: fixId },
        data: {
          status:     "VERIFIED",
          verifiedAt: new Date(),
        },
      });
    }

  } catch (err) {
    console.error("Fix pipeline error:", err);
    await db.sentraFixVerification.update({
      where: { id: fixId },
      data:  { status: "FAILED" },
    });
  }
}

// GET — poll fix status
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const findingId = searchParams.get("findingId");

  if (!findingId) return NextResponse.json({ error: "findingId required" }, { status: 400 });

  const fix = await db.sentraFixVerification.findUnique({
    where: { findingId },
  });

  return NextResponse.json({ fix });
}