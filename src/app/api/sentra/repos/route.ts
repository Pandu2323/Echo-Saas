import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import {
  fetchRepoInfo,
  fetchRepoLanguages,
  parseGitHubUrl,
} from "@/lib/github";
import { requireSentraAuth } from "@/lib/sentra-cli-auth";

// GET — list connected repos
export async function GET(req: Request) {
  const ctx = await requireSentraAuth(req);
  if (!ctx)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId") ?? ctx.workspaceId;
  if (!workspaceId)
    return NextResponse.json(
      { error: "workspaceId required" },
      { status: 400 },
    );

  // const user = await db.user.findUnique({ where: { clerkId: userId } });
  // if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const repos = await db.sentraRepo.findMany({
    where: { workspaceId },
    include: {
      _count: { select: { findings: true, commits: true, scans: true } },
      findings: {
        where: { status: { in: ["OPEN", "IN_REVIEW"] } },
        select: { severity: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ repos });
}

// POST — connect a new repo
export async function POST(req: Request) {
  const ctx = await requireSentraAuth(req);
if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const body = await req.json();
const workspaceId = body.workspaceId ?? ctx.workspaceId;
const githubUrl = body.githubUrl;

  if (!workspaceId || !githubUrl) {
    return NextResponse.json(
      { error: "workspaceId and githubUrl required" },
      { status: 400 },
    );
  }

  const parsed = parseGitHubUrl(githubUrl);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid GitHub URL" }, { status: 400 });
  }

  // const user = await db.user.findUnique({ where: { clerkId: userId } });
  // if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // check if already connected
  const existing = await db.sentraRepo.findUnique({
    where: {
      workspaceId_fullName: {
        workspaceId,
        fullName: `${parsed.owner}/${parsed.repo}`,
      },
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Repository already connected" },
      { status: 400 },
    );
  }

  // get GitHub token from settings
  const settings = await db.sentraSettings.findUnique({
    where: { workspaceId },
  });
  const token = settings?.githubToken ?? undefined;

  // fetch repo info from GitHub
  const repoInfo = await fetchRepoInfo(parsed.owner, parsed.repo, token);
  if (!repoInfo) {
    return NextResponse.json(
      {
        error:
          "Repository not found or not accessible. For private repos, add a GitHub token in Settings.",
      },
      { status: 404 },
    );
  }

  const languages = await fetchRepoLanguages(parsed.owner, parsed.repo, token);

  const repo = await db.sentraRepo.create({
    data: {
      workspaceId,
      githubUrl,
      owner: parsed.owner,
      repoName: parsed.repo,
      fullName: repoInfo.full_name,
      description: repoInfo.description ?? null,
      isPrivate: repoInfo.private,
      defaultBranch: repoInfo.default_branch,
      language: repoInfo.language ?? null,
      languages: languages,
      stars: repoInfo.stargazers_count,
      forks: repoInfo.forks_count,
      openIssues: repoInfo.open_issues_count,
      scanStatus: "PENDING",
    },
  });

  return NextResponse.json({ repo });
}
