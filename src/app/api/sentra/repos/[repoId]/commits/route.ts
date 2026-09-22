import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { fetchRepoCommits } from "@/lib/github";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ repoId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { repoId } = await params;
  const { searchParams } = new URL(req.url);
  const refresh = searchParams.get("refresh") === "true";

  const repo = await db.sentraRepo.findUnique({
    where: { id: repoId },
    include: {
      commits: {
        orderBy: { committedAt: "desc" },
        take: 30,
      },
    },
  });

  if (!repo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // if refresh requested or no commits stored, fetch from GitHub
  if (refresh || repo.commits.length === 0) {
    const workspaceId = repo.workspaceId;
    const settings    = await db.sentraSettings.findUnique({ where: { workspaceId } });
    const token       = settings?.githubToken ?? undefined;

    const ghCommits = await fetchRepoCommits(repo.owner, repo.repoName, token, 30);

    for (const c of ghCommits) {
      try {
        await db.sentraCommit.upsert({
          where:  { repoId_sha: { repoId, sha: c.sha } },
          update: {
            additions:    c.stats?.additions ?? 0,
            deletions:    c.stats?.deletions ?? 0,
            filesChanged: c.files?.length    ?? 0,
          },
          create: {
            repoId,
            sha:          c.sha,
            message:      c.commit.message.split("\n")[0].slice(0, 200),
            authorName:   c.commit.author.name,
            authorEmail:  c.commit.author.email,
            branch:       repo.defaultBranch,
            additions:    c.stats?.additions ?? 0,
            deletions:    c.stats?.deletions ?? 0,
            filesChanged: c.files?.length    ?? 0,
            committedAt:  new Date(c.commit.author.date),
          },
        });
      } catch {}
    }

    // re-fetch from DB after sync
    const updated = await db.sentraRepo.findUnique({
      where:   { id: repoId },
      include: { commits: { orderBy: { committedAt: "desc" }, take: 30 } },
    });
    return NextResponse.json({ commits: updated?.commits ?? [] });
  }

  return NextResponse.json({ commits: repo.commits });
}