/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireSentraAuth } from "@/lib/sentra-cli-auth";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ repoId: string }> },
) {
  const ctx = await requireSentraAuth(_req);
  if (!ctx)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { repoId } = await params;

  const repo = await db.sentraRepo.findUnique({
    where: { id: repoId },
    include: { commits: { orderBy: { committedAt: "desc" } } },
  });

  if (!repo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const commits = repo.commits;

  // ── contributor stats ──────────────────────────────────────────────
  const contribMap: Record<
    string,
    {
      name: string;
      email: string;
      commits: number;
      additions: number;
      deletions: number;
    }
  > = {};

  for (const c of commits) {
    const key = c.authorEmail;
    if (!contribMap[key]) {
      contribMap[key] = {
        name: c.authorName,
        email: c.authorEmail,
        commits: 0,
        additions: 0,
        deletions: 0,
      };
    }
    contribMap[key].commits += 1;
    contribMap[key].additions += c.additions;
    contribMap[key].deletions += c.deletions;
  }

  const contributors = Object.values(contribMap)
    .sort((a, b) => b.commits - a.commits)
    .slice(0, 10);

  const totalCommits = commits.length;
  contributors.forEach((c) => {
    (c as any).pct =
      totalCommits > 0 ? Math.round((c.commits / totalCommits) * 100) : 0;
  });

  // ── daily activity (last 7 days) ───────────────────────────────────
  const now = new Date();
  const dailyMap: Record<string, number> = {};

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    dailyMap[key] = 0;
  }

  for (const c of commits) {
    const key = new Date(c.committedAt).toISOString().slice(0, 10);
    if (key in dailyMap) dailyMap[key] += 1;
  }

  const daily = Object.entries(dailyMap).map(([date, count]) => ({
    date,
    label: new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    count,
  }));

  // ── streak calculation ─────────────────────────────────────────────
  const activeDays = new Set(
    commits.map((c) => new Date(c.committedAt).toISOString().slice(0, 10)),
  );

  let streak = 0;
  const today = new Date().toISOString().slice(0, 10);
  let check = today;

  while (activeDays.has(check)) {
    streak++;
    const prev = new Date(check);
    prev.setDate(prev.getDate() - 1);
    check = prev.toISOString().slice(0, 10);
  }

  // ── totals ─────────────────────────────────────────────────────────
  const totalAdditions = commits.reduce((s, c) => s + c.additions, 0);
  const totalDeletions = commits.reduce((s, c) => s + c.deletions, 0);
  const totalFiles = commits.reduce((s, c) => s + c.filesChanged, 0);
  const activeDaysCount = activeDays.size;
  const avgPerDay =
    activeDaysCount > 0 ? (totalCommits / Math.max(1, 7)).toFixed(1) : "0";
  const lastCommit = commits[0]?.committedAt ?? null;

  return NextResponse.json({
    totalCommits,
    totalAdditions,
    totalDeletions,
    totalFiles,
    activeDaysCount,
    avgPerDay,
    streak,
    lastCommit,
    contributors,
    daily,
    languages: repo.languages,
    riskScore: repo.riskScore,
    fullName: repo.fullName,
    description: repo.description,
    isPrivate: repo.isPrivate,
  });
}
